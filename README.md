# Knowledge Compiler

Everything you read, compiled into one self-organizing wiki and topic graph.

Save a passage, a link, or a whole article. An agent works out where it belongs,
merges it into the right page, and shows you exactly what changed — page created
or merged, which claims landed, what got disputed, which connections formed.

Built on the pattern Andrej Karpathy described as an "LLM knowledge base":
**compile once, don't retrieve per query.**

---

## What makes it different

Recall.it, Glasp, and Readwise all capture and summarise. None of them show you
the compile step, and none of them reconcile sources against each other. Four
things here follow from taking that seriously:

| | What it does |
| --- | --- |
| **Compile diff** | Every save produces a visible, structured diff. The agent's work is inspectable, not a black box. |
| **Claim-level provenance** | Every claim stores the verbatim sentence that produced it. Document-level citation tells you where to look; this tells you what was said. |
| **Contradiction detection** | When a new source conflicts with an existing claim, both sides are recorded and flagged. The agent never silently overwrites. |
| **Revision history + undo** | Every compile is a revision. Roll a page back and the graph edges that compile created are withdrawn with it. |

Plus typed graph edges (`extends`, `contradicts`, `prerequisite_of`,
`example_of`) rather than undifferentiated "related to" links, and surfaced
knowledge gaps — prerequisites your reading leans on but never covers.

---

## How it is arranged

```
account
└── workspace                one per subject; nothing crosses between them
    ├── captures             pastes, links, clipped articles, PDFs
    ├── wiki pages           compiled from those captures, claim by claim
    ├── topic graph          typed edges between what the pages talk about
    ├── knowledge gaps       prerequisites the reading leans on but never covers
    └── conversations        copilot threads, answered only from this workspace
```

One account keeps as many workspaces as it has subjects, and each holds its own
captures and everything compiled from them. A question asked in one workspace is
answered only from what that workspace has read — which is what makes an answer
attributable at all.

Workspaces are Better Auth organizations, so membership, roles and invitations
come from the same place as the session.

---

## The surfaces

| | |
| --- | --- |
| **Capture** | Four ways in — paste, link, clipped article, PDF — beside a live feed of what each save did to the knowledge base. |
| **Wiki** | Pages that wrote themselves. Every claim keeps the sentence it came from, and every compile is a revision you can roll back. |
| **Ask** | Conversations with the copilot. Multi-turn, saved per workspace, and answered only from compiled pages — with the claims cited inline. |
| **Graph** | Typed edges (`extends`, `contradicts`, `prerequisite_of`, `example_of`) plus the same graph as a keyboard-navigable index. |
| **Gaps** | Prerequisites noticed while compiling: what your reading assumes but never covers. |
| **Visual help** | A guided tour in the navbar that highlights real controls in place, and skips steps whose target is not on the current page. |

---

## Architecture

```
  Web app          Extension
 (TanStack Start)   (MV3)
       │                │
       └────────┬───────┘
                ▼
      Python API  :8000  ── owns the database, embeddings, and the event feed
                │
       ┌────────┴────────┐
       ▼                 ▼
   Redis queue      CockroachDB
       │            (wiki, graph, vectors)
       ▼                 ▲
  Mastra agent :4111 ────┘
  extract → match → compile → link → persist
```

**One rule holds the design together: the agent owns reasoning, the API owns
data.** The Mastra service never opens a database connection — it reads and
writes only through the API's internal endpoints. That keeps a single
transactional writer, so a failed agent run can never leave the knowledge base
half-updated, and it makes each pipeline stage testable on its own.

| Layer | Choice |
| --- | --- |
| Frontend | TanStack Start (React 19, Vite, Tailwind v4) |
| API | FastAPI + SQLAlchemy async + arq |
| Agent | Mastra v1, GLM-5 via AWS Bedrock Mantle |
| Database | CockroachDB (native `VECTOR` type + cosine vector indexes) |
| Migrations | Prisma |
| Queue / events | Redis (arq queue + pub/sub → SSE) |

---

## Getting started

Requires Node 20.19+, Python 3.11+, [uv](https://docs.astral.sh/uv/), Docker, and pnpm.

**One-time setup:**

```bash
cp .env.example .env
```

Set `OPENAI_API_KEY` to a real Bedrock API key. Nothing else in the file needs
touching — everything below the required block is derived at startup.

```bash
pnpm setup
```

That installs dependencies, starts CockroachDB + Redis, applies the migration,
and syncs the Python environment.

**Then, every time — one command for the whole stack:**

```bash
pnpm dev
```

This clears anything left from a previous session, brings the containers up, and
runs all four services with labelled output. `Ctrl+C` stops them together.

| | |
| --- | --- |
| Web app | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Mastra studio | http://localhost:4111 |
| CockroachDB console | http://localhost:8080 |

To run a single service on its own: `pnpm dev:web`, `pnpm dev:agent`,
`pnpm api:dev`, `pnpm api:worker`.

> If a service will not start after an unclean shutdown, `pnpm dev:clean` frees
> the ports and clears Mastra's dev lock. `pnpm dev` already does this first.

Seed a demo knowledge base (18 sources across three overlapping topic clusters,
including a pair that deliberately contradicts). Items belong to a workspace, so
seeding needs an account to seed into — sign up in the app first, then:

```bash
SEED_EMAIL=you@example.com SEED_PASSWORD=... pnpm seed
```

It signs in, seeds your first workspace, and names it before starting. If you
would rather not put a password on the command line, copy a token from
`http://localhost:3000/api/auth/token` while signed in and pass `SEED_TOKEN`
instead. Re-running is safe: identical content is detected as a duplicate and
nothing is compiled twice.

---

## Configuration

`.env.example` documents the full surface. Only the first block is required —
everything else is derived and documented inline.

Two derivations worth knowing:

**Bedrock Mantle has no `/v1/embeddings`.** It serves `/v1/models`,
`/v1/responses`, and `/v1/chat/completions`. Embeddings therefore go through the
separate `bedrock-runtime` service via boto3. A Bedrock API key is valid for
both, so `OPENAI_API_KEY` is reused as `AWS_BEARER_TOKEN_BEDROCK` and the region
is parsed out of `OPENAI_BASE_URL` — no extra required variables.

**Embedding providers are probed at startup**, because which model exists depends
entirely on the region. Measured against Bedrock directly: `ap-southeast-3`
(Jakarta) lists exactly **one** embedding model — Cohere Embed v4 — and
`ap-southeast-1` lists three. **Titan is in none of the APAC regions**; it only
appears in the US ones.

The chain is Cohere → Titan → local ONNX, across the primary and fallback
regions. Whichever answers first is logged at boot and recorded per row in
`embedding_model`. All produce 1024-dim vectors, so the column is unchanged
either way.

> Cohere must be invoked through an inference profile id
> (`global.cohere.embed-v4:0`). The bare `cohere.embed-v4:0` rejects on-demand
> throughput.

**The similarity threshold follows the provider**, and this is not cosmetic —
the models disagree sharply about what a score means:

| Provider | Threshold | Unrelated text sits near |
| --- | --- | --- |
| Cohere Embed v4 | 0.40 | 0.24 |
| Titan v2 | 0.78 | — |
| bge-small (local) | 0.70 | 0.48 |

Cohere's value was measured over the seed corpus (153 pairs across 3 known
clusters). It is biased toward precision: a false merge fuses two unrelated
topics into one page and needs an explicit undo, whereas a missed merge just
leaves two pages a later source can still join. Setting a single global 0.78
would merge nothing at all on Cohere.

---

## Database notes

`knowledge_base` is shared with an unrelated project whose tables live in
`public`. Everything here lives in a dedicated **`kc` schema**, which is why
`prisma.config.ts` pins the connection to it — Prisma Migrate manages a whole
schema and drops what it does not recognise.

Two consequences to know before touching migrations:

1. **Never run bare `prisma migrate dev`.** Use `pnpm db:migrate:new <name>` to
   author and `pnpm db:migrate` to apply. Both avoid drift detection.
2. **Vector indexes cannot be expressed in `schema.prisma`.** They live in an
   append-only block at the end of the migration, and `db:migrate:new` strips the
   `DROP INDEX` statements Prisma emits for them. Losing one silently turns k-NN
   into a full table scan.

---

## Conversations

Threads belong to the **workspace**, not to the person who opened them — the same
rule as the evidence they rest on, so a colleague added to the workspace can read
how a conclusion was reached rather than only the conclusion.

A turn is stored whole: the question and the answer arrive together, because a
question saved without its answer renders as a thread that hangs. Each stored
answer keeps its citations and everything retrieval consulted, so reopening a
thread does not re-run retrieval and a citation survives the page being edited
later.

Follow-ups work because the thread travels with the question. Two details make
that hold:

- **Retrieval is context-aware.** "Can it be avoided?" carries almost no
  searchable text, so for short follow-ups the previous question is folded into
  the search. Without it the copilot refuses a question it could answer — which
  is exactly what it does when history is withheld.
- **Order is explicit.** Both messages of a turn are written in one transaction
  and take the same timestamp, so they are ordered by time *and* role. Sorting on
  time alone put answers above their questions.

---

## Performance

Measured on the production build, gzipped:

| | JS | Budget |
| --- | --- | --- |
| Landing page | ~126 KB | 150 KB |
| App pages | ~123–127 KB | 300 KB |
| Graph page | ~184 KB | 300 KB |

`react-force-graph` (60 KB gzipped) is code-split and loads only on `/graph`.
CSS is 21 KB gzipped against a 30 KB budget.

Two fonts are preloaded — Source Serif 4 at 600, which sets every heading
including the landing page's LCP element, and Inter at 400 for the interface.
The remaining six are left to discovery. The preload hrefs resolve to the same
hashed assets the `@font-face` rules request, so nothing is fetched twice.

A latin reader downloads 173 KB of fonts across 8 files. The build also emits
~742 KB of legacy `.woff` and ~231 KB of non-latin subsets that a latin reader
never requests. Switching to `@fontsource`'s `latin-*` entrypoints would remove
both, at the cost of rendering Cyrillic, Greek and Vietnamese content in a
fallback face — and since arbitrary saved content is the product, that trade has
been left un-made deliberately.

---

## Rate limits

Each save is a model call, and a long PDF becomes several, so both save endpoints
and the copilot are capped per workspace per hour — a spend ceiling rather than an
abuse control. Defaults sit well above what ordinary reading generates
(`COMPILE_RATE_LIMIT_PER_HOUR=120`, `ASK_RATE_LIMIT_PER_HOUR=240`) and are keyed
by workspace, so one account can neither spend nor throttle another's allowance.

Over the limit returns `429` with `Retry-After`. If Redis is unreachable the
limiter fails open and logs — losing the ceiling is preferable to losing the API.

---

## Testing

```bash
pnpm test
```

Runs both suites — vitest across `web` and `agent`, then pytest for the API. Run
one at a time with `pnpm test:ts` or `pnpm api:test`.

**Python** covers content-hash dedupe, the connection-URL rewrite, the config
derivations above, SSRF guards on saved links, provider selection order, PDF
extraction and chunking, workspace scoping, which run states may be retried, and
the zero-padding property the local embedding fallback depends on.

**TypeScript** covers the two pure functions that carry the most risk per line:
citation resolution in the copilot (an answer's grounding is only as good as the
labels it parses) and tab-strip keyboard navigation (`role="tab"` promises arrow
keys work). Both had shipped bugs; the tests were written against the failures.

---

## Repository layout

```
apps/
  web/         TanStack Start app — capture, wiki, graph, gaps
  api/         FastAPI: storage, embeddings, SSE, agent callbacks
  agent/       Mastra: the five-step compile workflow
  extension/   Manifest V3 clipper, no build step
packages/
  contracts/   Shared zod schemas
  tsconfig/    Shared TypeScript config
prisma/        Schema and migrations
scripts/       db:up and migration tooling
```

---

## Out of scope

Per the PRD: no multi-user collaboration, no spaced repetition, no native mobile
apps, no video or audio sources, and no rich WYSIWYG editing — pages are
agent-maintained, with revert as the correction mechanism.
