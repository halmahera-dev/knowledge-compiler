# Context

## Glossary

**Note** — a compiled, agent-maintained record produced by the compile pipeline
from captured sources. Previously called a "wiki page" in `apps/web` (the old
TanStack Router app); same concept, renamed for `apps/client` (the Next.js
app). Not a user-authored note — the data is compiler output. Routed at
`/[slug]` via `NoteReader` in `apps/client`.

**Gap** (Knowledge gap) — a prerequisite or follow-up question the compiler
noticed while compiling a Note, which the knowledge base cannot yet answer.
Backend model: `KnowledgeGap` (`apps/api/app/models.py`). States: `open`,
`dismissed`, `filled`; only `open` gaps are ever listed. A gap may reference
the Note it was noticed from (`nodeLabel` / `nodeSlug` → links to `/[slug]`).
Not yet surfaced anywhere in `apps/client` (see `FEATURE_MIGRATION_MAP.md`).
