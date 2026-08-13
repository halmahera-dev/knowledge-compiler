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
| **Graph** | Typed edges (`extends`, `contradicts`, `prerequisite_of`, `example_of`) plus the same graph as a keyboard-navigable index, and a named summary of each cluster in it. |
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

## Which CockroachDB and AWS tools this uses

Named against the code that uses them, rather than in the abstract.

### CockroachDB

| Tool | Where | What it does here |
| --- | --- | --- |
| **Distributed vector indexing** | [`matching.py`](apps/api/app/services/matching.py), [`retrieval.py`](apps/api/app/services/retrieval.py), `prisma/migrations/*/migration.sql` | Native `VECTOR(1024)` columns on `raw_items` and `wiki_pages`, with `CREATE VECTOR INDEX` on both and cosine (`<=>`) k-NN over them. |
| **ccloud CLI** | [`scripts/ccloud.mjs`](scripts/ccloud.mjs) — `pnpm ccloud` | Seven commands over the Cloud control plane: cluster health, connection string, IP allowlist, migrations, backup retention, and the control-plane audit log. Every call uses `-o json`. |
| **Cloud Managed MCP Server** | [`.mcp.json.example`](.mcp.json.example) | Connects an MCP client to the cluster, so the agent can read schemas, inspect running queries, and run read-only SQL against the live database. |
| **Agent Skills** | [`skills/`](skills/) | Four machine-executable skills in the upstream format, each encoding a CockroachDB failure this codebase hit and diagnosed. Validated by `pnpm test:scripts`. |

All four tools are used.

The skills are the ones a general collection cannot contain, because each is
about the seam between CockroachDB and a particular tool: Prisma Migrate
dropping another application's tables on a shared database, a vector index the
migration tool re-emits `DROP INDEX` for on every migration, k-NN belonging on
the write path rather than the read path, and `coalesce(sum(int_col), 0)` being
rejected outright. Every one is drawn from a fix in this repository, and the
file that demonstrates it is named in the skill. Upstream's general collection
installs alongside them with `npx skills add cockroachlabs/cockroachdb-skills`.

**`-o json`, not the printed table.** The CLI advertises JSON output on every
command, and that is the difference between reading it and guessing at it. An
earlier version of this script split `cluster list` on runs of two spaces —
which works until a column widens or a name contains one, and then fails by
selecting a different cluster rather than by erroring. The parsers now refuse an
unfamiliar payload and print the keys they did find, because the value being
read decides which cluster gets migrated.

`pnpm ccloud audit` reads the control-plane log the same way. An IP allowlist
answers who *can* reach the cluster; the audit log is the other half — who
actually changed it, and when.

### What the agent actually does with each

Two different agents are involved, and conflating them would overstate the case.
The **compile agent** is the Mastra service that runs inside the product on every
save. The **operating agent** is whatever coding agent has the repository open —
Claude Code here — which is precisely who ccloud, the MCP server and Agent Skills
are built for.

**Distributed vector indexing — the compile agent, on every save and every
question.** This is the one on the product's hot path, and the call is traceable
end to end. The pipeline's `match` step calls `searchSimilarPages()`
([`compile-item.ts`](apps/agent/src/mastra/workflows/compile-item.ts)), which
posts to `/internal/match`, which runs

```sql
ORDER BY embedding <=> CAST(:query_vector AS VECTOR(1024)) LIMIT :limit
```

against `wiki_pages_embedding_idx`. The agent gets back the nearest pages and the
provider's calibrated threshold, and its `compile` step uses them to decide
`create`, `merge` or `addendum` — the single decision the whole product turns on.
The same index answers the copilot at read time through
[`retrieval.py`](apps/api/app/services/retrieval.py). Two jobs, one index, no
separate vector store to keep consistent with the operational data.

**ccloud CLI — the operating agent, against the control plane.**
[`scripts/ccloud.mjs`](scripts/ccloud.mjs) is what the agent runs instead of
being told connection strings. It asks the control plane which clusters exist,
fetches the connection string as JSON and rewrites it onto the `kc` schema, adds
the current machine to the SQL allowlist, applies migrations through the
project's own migrate script so the vector indexes survive, reads backup
retention, and reads the audit log. Every call passes `-o json`, so the agent
parses fields rather than a table it might read wrongly — a distinction that
matters here because the value it reads decides which database gets migrated.

**Managed MCP Server — the operating agent, against the live cluster.**
[`.mcp.json.example`](.mcp.json.example) connects a client with no proxy in
between, so the agent can list databases, read a table's schema, run read-only
SQL and inspect running queries while working on the code — instead of guessing
at the schema from `schema.prisma` and finding out at runtime. The connection is
verified: the endpoint completes the handshake and advertises twelve tools.
Destructive SQL is not exposed at all, which is what makes it safe to leave
connected against a database shared with an unrelated project.

**Agent Skills — the operating agent, before it makes the mistake.** The four in
[`skills/`](skills/) are read at the moment they apply, and each is a failure
this repository already absorbed: dropping another application's tables through
an unpinned Prisma connection, losing a vector index to a migration that keeps
re-emitting `DROP INDEX`, putting k-NN on the read path where it never
consolidates, and `coalesce(sum(int_col), 0)` being rejected outright. Three of
the four are invisible when they happen — a successful migration, a correct query
that now scans, a store that quietly never merges.

**What is exercised, and what is only wired.** The vector index runs on every
save in this repository, and the ccloud wrapper's parsing is covered by tests.
The MCP connection is verified as far as the handshake and tool list; a service
account with no cluster role returns `{"rows":[]}` from `list_clusters`, which is
indistinguishable from an empty organization, so grant it Cluster Admin or
Cluster Operator before trusting that surface.

**The vector index sits on the write path, which is the whole point.** Most
projects reach for a vector index at read time — embed the question, retrieve
neighbours, answer. Here `matching.py` runs its k-NN *while compiling a save*, to
decide whether what you just captured belongs to a page that already exists. That
single query is what makes the knowledge base self-organizing rather than a pile
of documents: the merge decision happens once, at write time, and every later
read is a plain indexed lookup of already-compiled prose.

`retrieval.py` then uses the same index the ordinary way, to ground the copilot.
Two different jobs, one index — and the threshold differs per embedding provider
because the models disagree about what a score means (see [Configuration](#configuration)).

### AWS

| Service | Where | What it does here |
| --- | --- | --- |
| **Amazon Bedrock** (Mantle) | [`apps/agent/src/mastra/config.ts`](apps/agent/src/mastra/config.ts) | `zai.glm-5` drives every reasoning step — extract, match, compile, link — and the copilot's answers. |
| **Amazon Bedrock** (`bedrock-runtime`) | [`apps/api/app/embeddings.py`](apps/api/app/embeddings.py) | Cohere Embed v4 via `global.cohere.embed-v4:0` produces every 1024-dim vector the index above stores. |

Bedrock is reached two different ways because Mantle has no `/v1/embeddings`
endpoint; embeddings go through `bedrock-runtime` over boto3. One Bedrock API key
is valid for both, which is why the required block in `.env` has a single key.

Object storage for PDFs and other unstructured uploads goes through the S3 API
via boto3 ([`storage.py`](apps/api/app/services/storage.py)), configured by
`S3_ENDPOINT_URL`. Local development points that at MinIO; moving to Amazon S3
means dropping `S3_ENDPOINT_URL` and setting a real `S3_REGION`, with no code
change. **It points at MinIO by default, so treat S3 as compatible-and-ready
rather than as a service this currently depends on** — the AWS requirement is met
by Bedrock, twice over.

### Connecting the MCP server

[`.mcp.json`](.mcp.json) is checked in and holds no secret. Claude Code, Cursor,
or any MCP client picks it up from the repo root:

```json
{
  "mcpServers": {
    "cockroachdb-cloud": {
      "type": "http",
      "url": "https://cockroachlabs.cloud/mcp"
    }
  }
}
```

No credentials appear in the file because the endpoint advertises OAuth 2.1
(`mcp:read` and `mcp:write` scopes, discovered from
`/.well-known/oauth-protected-resource/mcp`), so the client runs the browser flow
on first use and stores the token itself. You need **Cluster Admin** or **Cluster
Operator** on the target cluster.

`.mcp.json` also carries a service-account header for pipelines with no browser.
The key is read from the environment and is never written into the file:

```json
"headers": { "Authorization": "Bearer ${CC_API_KEY}" }
```

```bash
export CC_API_KEY=...   # from Cloud Console → Access Management → Service Accounts
```

The literal is not an option worth taking. This file is committed, and a key
pasted into it is a key published the moment the repository is — an accident
that is one paste away and needs the key rotated, not edited.

**A service account sees only the clusters its roles name.** Authenticating and
seeing nothing look identical from the client: `list_clusters` returns
`{"rows":[]}` either way. If it comes back empty, grant the account **Cluster
Admin** or **Cluster Operator** on the cluster and check it belongs to the same
organization as the key.

Write tools (`create_database`, `create_table`, `insert_rows`) are off unless
explicitly enabled, and destructive SQL is not exposed at all — so this cannot
drop the `public` schema this database shares with an unrelated project.

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

## Clusters and their names

The graph clusters with **Louvain**, over both the agent's typed edges and edges
derived from provenance. The derived half is not an enhancement — without it
nothing can cluster at all. Edges are only ever written between nodes that a
single compile established, so no edge spans two saves, and a real workspace of
68 nodes came out as 28 disconnected components. Detection over that returns the
components back, which is a fact a union-find already knows.

Each cluster is then **named by the summariser**, and this is where the design
earns its keep: a summary is stored against a **hash of the cluster's
membership**, never against its number. Louvain renumbers on every run, so prose
filed under "cluster 3" would quietly describe a different set of nodes after the
next save — wrong in the one place a reader has no way to check it. Keyed by
membership, an unchanged cluster keeps its paragraph and costs nothing.

That is also the cost control. Naming runs at the end of a compile, and only for
clusters that both changed and are large enough to be a theme rather than a
coincidence (`MIN_SUMMARY_NODES`), capped at `MAX_COMMUNITIES_PER_RUN` per save.
A save that shifts nothing makes no model call. Measured on the workspace above:
seven clusters, ~570 tokens and under four seconds each.

The names travel with every copilot answer as **themes** — a map of what the
workspace covers, kept strictly apart from claims. A claim carries a verbatim
source quote and can be checked; a theme is prose about a group of pages and
cannot. So themes may say what is in the collection, or which area comes closest
when retrieval finds nothing, and may never be cited or used to assert a fact.
Before them, "what have I been reading about?" was unanswerable — retrieval
returns claims, and no claim is about the shape of the collection.

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

Runs all three — vitest across `web` and `agent`, Node's built-in runner over
`scripts/`, then pytest for the API. One at a time with `pnpm test:ts`,
`pnpm test:scripts`, or `pnpm api:test`.

**Python** covers content-hash dedupe, the connection-URL rewrite, the config
derivations above, SSRF guards on saved links, provider selection order, PDF
extraction and chunking, workspace scoping, which run states may be retried, and
the zero-padding property the local embedding fallback depends on.

**TypeScript** covers the pure functions that carry the most risk per line:
citation resolution in the copilot (an answer's grounding is only as good as the
labels it parses), Markdown rendering (built as React elements, never an HTML
string, so nothing the model emits can inject markup), redirect and URL guards,
graph phrasing, and tab-strip keyboard navigation (`role="tab"` promises arrow
keys work). Most were written against a shipped bug rather than ahead of one.

**Scripts** covers the connection-string rewrite in `pnpm ccloud`, where being
wrong is silent: Cloud also returns a `/<cluster>.<database>` path, and replacing
the whole segment migrates against the wrong cluster without complaint.

---

## Repository layout

```
apps/
  web/         TanStack Start app — capture, wiki, graph, gaps (current)
  client/      Next.js rewrite of apps/web, in progress — see CONTEXT.md and
               FEATURE_MIGRATION_MAP.md for what has and has not moved over
  api/         FastAPI: storage, embeddings, SSE, agent callbacks
  agent/       Mastra: the five-step compile workflow
  extension/   Manifest V3 clipper, no build step
packages/
  contracts/   Shared zod schemas
  tsconfig/    Shared TypeScript config
prisma/        Schema and migrations
scripts/       db:up, migration tooling, and the ccloud workflow
.mcp.json      CockroachDB Cloud MCP server, for any MCP client
```

---

## Out of scope

Per the PRD: no multi-user collaboration, no spaced repetition, no native mobile
apps, no video or audio sources, and no rich WYSIWYG editing — pages are
agent-maintained, with revert as the correction mechanism.
