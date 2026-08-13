import path from "node:path";
import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

// The repository keeps one .env at the root, shared by the Python API, the
// agent, and this package. It pointed at apps/web/.env, which the move to
// apps/client left behind — dotenv loaded nothing, DATABASE_URL was undefined,
// and `prisma generate` failed the whole install rather than only itself.
dotenv.config({
  path: path.join("..", "..", ".env"),
});

// `prisma migrate status`/`deploy`/`dev` are BROKEN against this database as of
// Prisma 7.9.1: the `cockroachdb` provider's schema-engine cannot locate
// `_prisma_migrations` under `multiSchema` — it reports `hasMigrationsTable:
// false` even though `kc._prisma_migrations` exists and has every migration
// recorded (confirmed directly with psql). `provider = "cockroachdb"` is not
// optional though — Prisma refuses to run migrate commands against a live
// CockroachDB connection under `provider = "postgresql"`.
//
// None of this affects the running app: `prisma generate` and the generated
// client (what Better Auth and @kc/db actually use at runtime) work fine under
// `cockroachdb` + multiSchema. Only the CLI's own migration tooling is broken.
//
// Until this is fixed upstream, apply new migrations by hand:
//   1. Write prisma/migrations/<timestamp>_<name>/migration.sql as usual.
//   2. Run it directly: psql "$DATABASE_URL" -f prisma/migrations/.../migration.sql
//   3. Record it so `migrate status` (once it works again) doesn't replay it:
//      INSERT INTO kc._prisma_migrations
//        (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
//      VALUES (gen_random_uuid()::text, '', '<timestamp>_<name>', now(), now(), 1);
export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
