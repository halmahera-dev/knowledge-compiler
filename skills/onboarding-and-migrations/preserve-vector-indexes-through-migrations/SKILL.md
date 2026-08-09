---
name: preserve-vector-indexes-through-migrations
description: Use when a CockroachDB table has a vector index and the schema is managed by a migration tool that cannot express one, such as Prisma. The tool sees an index it did not create, emits DROP INDEX for it in every subsequent migration, and the loss is silent — queries keep returning correct answers while scanning the whole table. Covers detecting the drop, stripping it automatically, and confirming the index survived.
---

# Keeping a vector index a migration tool cannot see

## When this applies

A `VECTOR` column with `CREATE VECTOR INDEX` on it, in a schema managed by a
tool whose schema language has no syntax for that index. Prisma is the common
case; the same holds for anything that reconciles a declared model against the
live database.

## The failure it prevents

The index has to be created by hand, in raw SQL appended to a migration. From
then on the tool sees an index that is not in its model and does the consistent
thing: it generates `DROP INDEX` for it, in every migration you author
afterwards.

**Nothing breaks when that lands.** `ORDER BY embedding <=> $1 LIMIT 5` still
returns the correct rows — it just reads every row to do it. The symptom is a
query that grew slowly, months later, on a table that grew. By then the
migration that dropped it is far behind you.

## Strip the drops when authoring, not when reviewing

Reviewing every generated migration works until the day someone is in a hurry.
Put it in the wrapper that writes the migration:

```js
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
      out = out.replace(block, "");
      stripped.push(name);
    }
  }
  return { sql: out, stripped };
}
```

Print what was stripped. A silent fix teaches nobody, and the list is how a
reviewer notices a *new* vector index that has not been added to the constant.

## Creating the index

Append it to the migration by hand, after the table exists:

```sql
CREATE VECTOR INDEX IF NOT EXISTS "wiki_pages_embedding_idx"
    ON "wiki_pages" ("embedding" vector_cosine_ops);
```

`IF NOT EXISTS` matters: the same statement then re-runs harmlessly against a
database that already has it, which is what makes the migration replayable.

## Verifying it is still there

Do not infer this from query results — a full scan returns the same rows.

```sql
SHOW INDEXES FROM wiki_pages;
```

Or ask the planner directly, which is the stronger check:

```sql
EXPLAIN SELECT id FROM wiki_pages
ORDER BY embedding <=> $1 LIMIT 5;
```

A plan naming the vector index is the index working. A plan showing a full scan
is the index gone, whatever the rows say.
