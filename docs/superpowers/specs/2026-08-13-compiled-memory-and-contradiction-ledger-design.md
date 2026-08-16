# Compiled memory and the contradiction ledger

Design, 13 August 2026. Five days before the CockroachDB × AWS hackathon
deadline (18 August, 17:00 EDT).

## Why this, and why now

The hackathon scores five things. Three of them — Agentic Memory Design,
Real-World Impact, Creativity — are where this project can win or lose, and both
of the features below exist to move exactly those.

The competition's shape is known even though the project gallery is not yet
published. Cockroach Labs' own reference architecture, published alongside
Memori, tells entrants to capture interactions, embed them, and *"retrieve only
what's relevant for the current question or step"*. The one submission already
visible in public — *John CEO Agentic Memory* — follows it precisely: Lambda,
MCP, Bedrock Titan, `VECTOR(1024)`, top-k similarity, consolidation and
forgetting. Most of 3,404 entrants will submit a variant of that one project,
distinguished mainly by polish.

Knowledge Compiler answers the same question differently. Karpathy's pattern —
compile once at write time, do not retrieve per query — is a rejection of the
reference architecture rather than a tidier version of it. That is the strongest
card this project holds, and it is currently unplayable for two reasons:

1. **The claim is not true yet.** `apps/agent/src/mastra/agents/copilot.ts` rule
   one reads *"Call searchKnowledge for every question, including follow-ups."*
   At answering time we still retrieve per query. A judge reading the repository
   will find the gap in the exact criterion we most want to win.
2. **The difference is architectural, so it is invisible.** A three-minute video
   of a wiki and a cited chat looks like a well-built notes app.

## What is being built

Two features over one body of data. Nothing new is stored; both read what the
compile pipeline already writes.

**A. The compiled context pack.** The copilot stops searching in order to find
out what the workspace contains. Every turn begins with a briefing assembled
from compiled output — themes, page titles and summaries, and every open
contradiction. Search survives for one job: pulling a verbatim quote when the
answer needs to cite one.

**B. The contradiction ledger.** A workspace-level view of every claim the
compiler could not reconcile, with both sides' quotes, their sources, and when
each was saved.

They are one design, not two. The ledger is a section of the pack and a page of
its own, so B is nearly free once A exists; A carries the technical argument and
B gives it a human one.

### Chosen audience

The reader whose sources disagree with each other — a researcher or analyst
holding a literature that does not agree. This is the only audience for whom
this product does something a semantic memory store cannot: keep both sides,
marked, with the passage behind each. Every summariser resolves disagreement by
choosing a winner silently.

## What already exists

No migration. Every field below is written today, on the write path, once per
save:

| Data | Where |
| --- | --- |
| `wiki_claims.status = 'disputed'` | set by the compile pipeline when sources conflict |
| `claim_sources.quote`, `.stance` (`supports` / `contradicts`), `.raw_item_id` | the verbatim span behind every claim, and which side it takes |
| `wiki_pages.summary`, `.title`, `.slug`, `.current_revision_id` | compiled page prose |
| `graph_communities.title`, `.summary` | cluster names written by the summariser agent |
| `raw_items.title`, `.source_url`, `.created_at` | what was saved, and when |

## Architecture

Two endpoints, one agent change, one page.

```
compile pipeline (write path, unchanged)
        │  writes claims, disputes, page summaries, cluster summaries
        ▼
CockroachDB
        │
        ├── GET /api/v1/copilot/context ──► Mastra /chat route ──► system message
        │      (compact, token-budgeted)         (per turn)          before the model thinks
        │
        └── GET /api/v1/disputes ─────────► /disputes page ──► "Ask the copilot"
               (complete, screen-shaped)
```

**Two endpoints rather than one.** The pack has a token budget and must be
terse; the ledger has a screen budget and must be complete, with long quotes,
dates and source links. A single shape serving both would be too fat for the
prompt and too thin to read.

## A. The context pack

### Contents

- workspace figures: pages, claims, sources, when it last compiled
- themes: title, summary, page count
- pages: slug, title, summary
- open contradictions: claim text, page, both sides with quote and source
- a truncation notice, or null

### What it deliberately omits

Claim text and quotes for every claim. That is the bulk of the corpus and the
reason per-query retrieval existed. Quotes travel only for contradictions, where
a dispute without both quotes means nothing. For everything else the agent has
page summaries; when it needs to quote one sentence exactly, it searches — once,
to quote, not to find out what is there.

### Budget and honest truncation

A workspace of two hundred pages would blow the prompt. A character budget is
spent in priority order: themes first (the map, and few), then contradictions
(the point, and few), then pages until the budget runs out, most recently
compiled first.

**When pages are dropped the pack says so**, and the agent is instructed to
relay it. Without this the agent answers "your notes do not cover that" when the
truth is "that page did not fit in the briefing". For a product whose whole
value rests on a refusal the reader can trust, that is the most expensive lie
available.

### Assembly and lifetime

Injected as a system message and rebuilt every turn — never persisted into the
stored thread. A pack stored with the conversation would make turn ten stand on
the workspace as it was at turn one, three compiles ago. Memory must reflect
what has been compiled by the moment the question is asked.

### When it fails

Degrade to today's behaviour: tell the agent the briefing is unavailable and let
it search first, exactly as it does now. Not a refusal, and not an answer
pretending the workspace is empty. Relayed 401 and 409 messages are unchanged.

## B. The contradiction ledger

### Endpoint

`GET /api/v1/disputes`, MemberScope, workspace from the token. Every claim with
`status = 'disputed'` **on its page's current revision**.

That filter is not incidental: claims belong to revisions, so without it a
dispute undone by a rollback returns as though it were still live.

Each row carries the claim, the page it lives on, and both sides — verbatim
quote, source title and link, and the date the source was saved. Newest first: a
contradiction that appeared today is the one still worth acting on.

### Page

Route `/disputes`, labelled **Contradictions** in the sidebar.

`disputes` joins `RESERVED_SLUGS` in `apps/api/app/services/compile.py`. A
compiled page titled "Disputes" would otherwise take that slug, and Next
resolves a static segment before a dynamic one — the route would be permanently
unreachable. This is the lesson already paid for in phase 0.

Each row offers **"Ask the copilot"**, which opens `/agent` with the question
prefilled through the existing composer-draft mechanism. This closes the loop:
the ledger sends the reader to the copilot, and the copilot answers from a pack
that already contains that contradiction. For the video it is one unbroken move.

### What it deliberately does not do

No "resolve" or "dismiss". Two reasons, the second being the real one. It would
demand a resolution table and an answer to "what happens when a new source
reopens a settled dispute" — not a day-and-a-half of work. And it contradicts
the product: a button that closes a contradiction asks the reader to decide, and
then makes the product forget the disagreement ever existed. Keeping it is what
we sell.

Empty state says what is true: nothing here disagrees yet, and contradictions
appear when a new source contests a compiled claim. Not "all clear".

## The agent's instructions

Rule one inverts. Today: *"Call searchKnowledge for every question."* After: you
begin each turn with a briefing of this workspace — its themes, its pages and
what each covers, and every contradiction still open. That is your memory, and
it was assembled when the reader saved things, not when they asked.

Search is left for two cases: fetching a verbatim quote to cite, or a question
the briefing does not reach — including when the briefing reports itself
truncated. The agent says which of the two applies.

**Citations become two-tier.** `[c1]` markers stay reserved for claims whose
quote was actually retrieved. Answers resting on the briefing link pages as
ordinary markdown links. A page summary is prose the pipeline wrote, one remove
from the source, with nothing to check it against; giving it the same marker as
a quoted claim would make two levels of trust look identical. This also means no
change to the client's citation pipeline — Streamdown renders links already.

The refusal rule sharpens: if the briefing was truncated and the question
concerns a page that did not fit, say that rather than "your notes do not cover
it". The first is honest; the second is a lie that sounds the same.

## Proving the claim

`readEvidence` already walks each message's tool parts. Counting them yields one
line under the answer: *"Answered from compiled memory — no retrieval"* or
*"Pulled one quote from the source."* Photographable, recordable, and directly
comparable with the old behaviour.

**What will not be claimed:** not zero model calls, not zero database reads — the
pack is itself one read, of rows computed earlier. The claim is precise: no
per-question search across the corpus, because the corpus was digested on the
write path. Anything larger collapses under a judge's first question.

## Testing

The only real logic is the pack's budget allocation, so it lives in
`apps/api/app/services/context_pack.py` as a pure function: themes, pages,
disputes and a budget in, pack and truncation notice out. Its tests assert what
can actually go wrong — a budget too small reports "47 of 210"; themes and
contradictions are never the thing dropped; an empty workspace produces a pack
that says it is empty.

Endpoints are tested as the existing suite tests them: `dependency_overrides`
with a stub session, asserting the 401 and 409 refusals, no live database.

Prompt behaviour has no test harness. It is checked by hand at the checkpoint:
five fixed questions against the real workspace, answers read before recording.

## Risks

**Changing the answering path three days before recording.** Mitigated
structurally: the pack is additive, `searchKnowledge` stays intact, and a failed
pack fetch leaves today's behaviour. Reverting is deleting one injection in the
`/chat` route.

**Prompt regression** — over-refusal, under-citation. Mitigated by the five-question
pass before recording, not by hope.

**If time runs out, the ledger is what goes**, not the pack. The ledger is
cheaper, but the pack carries the technical argument, and contradictions remain
visible on wiki pages as they are today.

## Sequence

1. `GET /api/v1/disputes`, `context_pack.py` and its tests, `disputes` reserved.
2. `/chat` injects the pack; agent instructions rewritten; the evidence line in
   the client.
3. `/disputes` page, sidebar entry, "Ask the copilot"; one full pass against the
   real workspace.

The remaining three and a half days are for the public repository, the deploy,
the video and the README diagram. Outside this design, named so the boundary is
clear.

## Out of scope

Reconciliation on compile (memory that reopens a settled dispute when new
evidence arrives — the strongest idea considered, and the only one that touches
the compile pipeline, which is the one path that must not break before the
demo). Resolving or dismissing disputes. Multi-user narratives. Forgetting and
decay.
