# Agent Skills

Machine-executable CockroachDB expertise, in the format used by
[cockroachlabs/cockroachdb-skills](https://github.com/cockroachlabs/cockroachdb-skills):
`<domain>/<skill-name>/SKILL.md`, YAML frontmatter carrying `name` and
`description`, portable across Claude Code, Cursor, and any agent that reads the
format.

The upstream collection is the general one, and it is worth adding alongside
these:

```bash
npx skills add cockroachlabs/cockroachdb-skills
```

## What is here

These four are not a subset of upstream. Each one is a mistake this codebase
made, diagnosed, and paid for — the kind of thing a general CockroachDB skill
cannot know because it is about the seam between CockroachDB and a particular
tool.

| Skill | The failure it prevents |
| --- | --- |
| [`prisma-on-a-shared-cockroachdb-schema`](onboarding-and-migrations/prisma-on-a-shared-cockroachdb-schema/SKILL.md) | Prisma Migrate manages a whole schema and drops what it does not recognise. Pointed at `public` on a shared database, the first migration deletes the other application's tables — and succeeds. |
| [`preserve-vector-indexes-through-migrations`](onboarding-and-migrations/preserve-vector-indexes-through-migrations/SKILL.md) | A vector index the migration tool cannot express is one it emits `DROP INDEX` for, forever. Nothing breaks when that lands: k-NN keeps returning the right rows, by reading every one of them. |
| [`vector-index-on-the-write-path`](application-development/vector-index-on-the-write-path/SKILL.md) | Running k-NN only at read time gives a store that never consolidates. Moving it to ingest is what turns a pile of documents into memory — and the threshold has to follow the embedding model, not be a constant. |
| [`cockroachdb-sum-widens-to-decimal`](application-development/cockroachdb-sum-widens-to-decimal/SKILL.md) | `coalesce(sum(int_col), 0)` is rejected outright. It survives typechecking, mocked tests, and review, because the broken form is the idiomatic one. |

Every claim in them is drawn from code in this repository, and the file that
demonstrates it is named in the skill.

## Validation

`scripts/skills.test.mjs`, run by `pnpm test:scripts`, checks each skill against
the format: frontmatter parses, `name` matches the directory, naming is
lowercase-hyphenated, `name` and `description` are within the published limits,
the description states *when* to use the skill rather than only its topic, and
the body is more than a stub.

These files are selected by a machine matching on the description, so a skill
with a malformed header does not fail — it silently never loads. The test is
what makes that loud.
