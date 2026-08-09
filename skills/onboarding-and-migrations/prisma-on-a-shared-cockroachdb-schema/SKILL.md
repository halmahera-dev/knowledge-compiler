---
name: prisma-on-a-shared-cockroachdb-schema
description: Use when running Prisma Migrate against a CockroachDB database that holds tables belonging to more than one application. Prisma Migrate manages an entire schema and drops whatever it does not find in schema.prisma, so an unpinned connection will delete the other application's tables. Covers pinning the connection to a dedicated schema, why `prisma migrate dev` must never be run, and the schema_locked setting that rejects generated foreign keys on CockroachDB v25.4 and later.
---

# Prisma Migrate on a shared CockroachDB database

## When this applies

One CockroachDB database, more than one application's tables in it. Very common
when a team starts a second service before it is worth provisioning a second
cluster.

## The failure it prevents

**Prisma Migrate manages a schema, not a table list.** It compares
`schema.prisma` against everything in the schema it is pointed at, and anything
it does not recognise it generates a `DROP TABLE` for. Pointed at `public` on a
shared database, the first migration you run deletes the other application's
data. The migration succeeds. Nothing warns you.

## Pin the connection to a schema of your own

Do this in Prisma's config, not in the environment variable, so that no
`.env` a colleague writes can widen it:

```ts
// prisma.config.ts
const SCHEMA = "kc";

const parsed = new URL(process.env.COCKROACH_URL);
parsed.searchParams.set("schema", SCHEMA);
```

Confining Prisma to its own schema makes the destructive case impossible rather
than merely unlikely. Everything else in this skill assumes that is in place.

## Never run `prisma migrate dev`

`migrate dev` performs drift detection: it compares the database to the
migration history and, when they disagree, offers to reset — meaning drop and
recreate. On a shared database, "the database contains things my history does
not explain" is the permanent, correct state. It will always want to reset.

Use two commands instead:

- `prisma migrate diff` / a wrapper that writes the SQL, to author a migration
- `prisma migrate deploy`, which applies pending migrations and never resets

Wrap both so nobody has to remember. Route every schema change through the
wrapper and leave the raw command undocumented.

## `schema_locked` on CockroachDB v25.4 and later

New tables are created with `schema_locked = true`, which speeds up changefeeds
but rejects the `ALTER TABLE ... ADD CONSTRAINT` statements Prisma emits for
foreign keys. A generated migration will fail on its first foreign key.

Prepend this to the migration:

```sql
SET create_table_with_schema_locked = off;
```

It applies to the session only; tables created afterwards return to the default.

## Verifying

Before applying anything to a shared database, read the generated SQL and grep
it:

```bash
grep -iE "DROP (TABLE|SCHEMA)" prisma/migrations/*/migration.sql
```

A migration that only adds things contains none. If one appears and you did not
intend it, the connection is not pinned — fix that before looking at anything
else.
