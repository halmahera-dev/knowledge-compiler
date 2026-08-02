import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 reads the connection URL from here rather than from the schema's
 * datasource block.
 *
 * Two things are going on:
 *
 *  1. We reuse COCKROACH_URL from .env — the same value the Python API consumes
 *     (SQLAlchemy rewrites the scheme to `cockroachdb+asyncpg://`; Prisma wants
 *     the plain `postgresql://` form, which is what .env holds).
 *
 *  2. Everything is pinned to a dedicated `kc` schema. The `knowledge_base`
 *     database is shared with an unrelated project whose tables live in `public`.
 *     Prisma Migrate manages a whole schema and drops anything it does not know
 *     about, so without this scoping a `prisma migrate dev` would delete that
 *     project's data. Confining Prisma to `kc` makes that impossible rather than
 *     merely discouraged.
 */
const SCHEMA = "kc";

function scoped(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const parsed = new URL(url);
  parsed.searchParams.set("schema", SCHEMA);
  return parsed.toString();
}

const primary = process.env["COCKROACH_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: scoped(primary),
    /**
     * Prisma Migrate diffs against a throwaway database. CockroachDB will not
     * create one implicitly on a single-node insecure cluster, so it is named
     * explicitly and created by `pnpm db:up`.
     */
    shadowDatabaseUrl:
      scoped(process.env["COCKROACH_SHADOW_URL"]) ??
      scoped(primary?.replace("/knowledge_base?", "/knowledge_base_shadow?")),
  },
});
