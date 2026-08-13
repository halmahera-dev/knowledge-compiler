#!/usr/bin/env node
/**
 * Migration entry point. Two commands:
 *
 *   pnpm db:migrate           apply pending migrations  (prisma migrate deploy)
 *   pnpm db:migrate:new <name>  author a new migration  (prisma migrate diff)
 *
 * Why not plain `prisma migrate dev`?
 *
 *   `migrate dev` drift-checks the live database and drops anything not present
 *   in schema.prisma. Two things here make that unsafe:
 *
 *     1. `knowledge_base` is shared with an unrelated project. Scoping Prisma to
 *        the `kc` schema contains the blast radius, but there is no reason to
 *        rely on that alone.
 *     2. Vector indexes cannot be expressed in schema.prisma, so `migrate dev`
 *        reads them as drift and deletes them (pgvector/pgvector-node#18).
 *
 *   `migrate diff` never inspects the live database, and `migrate deploy` only
 *   applies migration files without drift-checking. Together they give the same
 *   workflow without either hazard.
 *
 * After authoring a migration, append any vector-index DDL by hand — see the
 * block at the bottom of 20260801000000_init/migration.sql for the pattern.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// The schema and its migrations moved into @kc/db when apps/web was retired.
// A second copy lived at the repository root for a while and drifted: it was
// regenerated for Postgres + pgvector, losing every CREATE VECTOR INDEX and
// the schema_locked prelude CockroachDB needs. Only this path is real now.
const DB_PACKAGE = join(ROOT, "packages", "db");
const MIGRATIONS_DIR = join(DB_PACKAGE, "prisma", "migrations");

// CockroachDB v25.4+ creates tables with schema_locked = true, which rejects the
// ALTER TABLE ... ADD CONSTRAINT statements Prisma emits for foreign keys.
const SESSION_PRELUDE = `-- CockroachDB v25.4+ creates tables with schema_locked = true by default, which
-- makes changefeeds faster but rejects the ALTER TABLE ... ADD CONSTRAINT
-- statements Prisma emits for foreign keys. Disabling it for this session lets
-- the migration run as generated; new tables revert to the default afterwards.
SET create_table_with_schema_locked = off;
`;

/**
 * Indexes that exist in the database but cannot exist in schema.prisma, because
 * Prisma has no way to express a vector index.
 *
 * Every `migrate diff` therefore proposes dropping them — it compares migration
 * history (where they appear, hand-appended) against the schema (where they
 * cannot). Left alone this silently deletes the indexes on the next migration
 * and turns similarity search into a full table scan. They are stripped from
 * generated SQL instead.
 *
 * Add to this list when adding a vector index.
 */
const VECTOR_INDEXES = ["raw_items_embedding_idx", "wiki_pages_embedding_idx"];

/** Removes `-- DropIndex\nDROP INDEX "<vector index>";` blocks from generated SQL. */
function stripVectorIndexDrops(sql) {
  let out = sql;
  const stripped = [];
  for (const name of VECTOR_INDEXES) {
    const block = new RegExp(
      String.raw`(?:^-- DropIndex\r?\n)?^DROP INDEX "${name}"[^;]*;\r?\n?`,
      "gm",
    );
    if (block.test(out)) {
      stripped.push(name);
      out = out.replace(block, "");
    }
  }
  return { sql: out.replace(/\n{3,}/g, "\n\n").trim(), stripped };
}

function prisma(args, { capture = false } = {}) {
  const res = spawnSync("npx", ["prisma", ...args], {
    cwd: DB_PACKAGE,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  const out = (res.stdout ?? "") + (res.stderr ?? "");
  // Through `npx` on Windows the CLI's exit code does not always propagate, so a
  // failed diff can look successful. Treat a reported error as a failure too,
  // otherwise a broken migration silently produces an empty file.
  const ok = res.status === 0 && !/^Error:/m.test(out);
  return { ok, out };
}

function deploy() {
  const res = prisma(["migrate", "deploy"]);
  if (!res.ok) process.exit(1);
}

function authorNew(name) {
  if (!name) {
    console.error("Usage: pnpm db:migrate:new <migration-name>");
    process.exit(1);
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  // Prisma orders migrations lexicographically by directory name.
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const dir = join(MIGRATIONS_DIR, `${stamp}_${slug}`);
  const file = join(dir, "migration.sql");

  // Diffing existing migrations against the schema means the live database is
  // never read, so nothing outside `kc` can influence the result.
  const res = prisma(
    [
      "migrate",
      "diff",
      "--from-migrations",
      "prisma/migrations",
      "--to-schema",
      "prisma/schema",
      "--script",
    ],
    { capture: true },
  );

  if (!res.ok) {
    console.error(res.out);
    process.exit(1);
  }

  const raw = res.out
    .split("\n")
    .filter((l) => !l.startsWith("Loaded Prisma config"))
    .join("\n")
    .trim();

  const { sql, stripped } = stripVectorIndexDrops(raw);

  if (stripped.length > 0) {
    console.log(
      `  kept vector index${stripped.length > 1 ? "es" : ""} Prisma wanted to drop: ` +
        stripped.join(", "),
    );
  }

  if (!sql || sql.includes("-- This is an empty migration.")) {
    console.log("No schema changes to migrate.");
    return;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${SESSION_PRELUDE}\n${sql}\n`, "utf8");

  console.log(`Created ${file.replace(ROOT, ".")}`);
  console.log("\nReview it before applying. If the change touches an embedding");
  console.log("column, append the CREATE VECTOR INDEX statements by hand —");
  console.log("Prisma cannot express them. Then run: pnpm db:migrate");
}

function verifyVectorIndexes() {
  // A vector index silently missing turns k-NN into a full scan, so surface it.
  const init = join(MIGRATIONS_DIR, "20260801000000_init", "migration.sql");
  if (!existsSync(init)) return;
  const sql = readFileSync(init, "utf8");
  if (!sql.includes("CREATE VECTOR INDEX")) {
    console.warn(
      "\n! The initial migration no longer contains CREATE VECTOR INDEX statements.\n" +
        "  Similarity search will fall back to a full scan.",
    );
  }
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case undefined:
  case "deploy":
    deploy();
    verifyVectorIndexes();
    break;
  case "new":
    authorNew(rest.join(" "));
    break;
  default:
    console.error(`Unknown command "${command}". Use: deploy | new <name>`);
    process.exit(1);
}
