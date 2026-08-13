# Feature Migration Map

`apps/web` (TanStack Start) was replaced by `apps/client` (Next.js 16). This
document was written mid-flight, as a comparison table of what the old app did
and what the new one was still missing. That migration is finished, so it is now
a record of where each capability ended up and what is still open.

`apps/web` has been deleted. Its behaviour is the specification this document
records, and git history holds the code if a detail ever needs checking.

## Where things live now

| Capability | Route | Implementation |
| --- | --- | --- |
| Compiled wiki index | `/` | `features/wiki/components/wiki-index.tsx` |
| Compiled page, claims, sources, revisions, rollback | `/[slug]` | `features/wiki/components/wiki-page-view.tsx` |
| Capture: paste, link, PDF, extension | `/capture` | `features/capture/components/capture-view.tsx` |
| Live compile feed (SSE) | `/capture` | `features/capture/compile-stream.ts`, `hooks/use-compile-feed.ts` |
| Copilot: cited answers over compiled claims | `/agent`, `/agent/[id]` | `features/agent/` |
| Topic graph with typed edges and named clusters | `/graph` | `features/graph/` |
| Knowledge gaps | `/gaps` | `features/gaps/` |
| AI usage and cost | `/ai-logs` | `features/usage/` |
| Workspace switching and account menu | sidebar | `features/user/components/nav-user.tsx` |
| Guided tour | any route, `?` or the sidebar footer | `features/tour/` |
| Landing page | `/landing` | `features/marketing/` |
| Auth handler and extension CORS | `/api/auth/*` | `app/api/auth/[...all]/route.ts` |

`/wiki` and `/wiki/:slug` 308 to `/` and `/:slug`; links shared before the move
still resolve.

## Decisions that were open, and how they were settled

| Decision | Settled as | Note |
| --- | --- | --- |
| `/` — public landing or signed-in index | Signed-in index. Signed-out visitors to `/` are redirected to `/landing`; any deeper path redirects to `/login?redirect=…` | A stranger typing the bare domain gets the pitch; someone following a link gets taken back to it after signing in |
| Capture through chat, or its own page | Its own page | [ADR 0002](docs/adr/0002-capture-is-its-own-page.md) supersedes ADR 0001 |
| Copilot thread storage | The Python API stores threads; Mastra only answers | Mastra scopes memory per user, and a conversation belongs to the workspace |
| Statistics dashboard | Deleted | Every figure derived from a sample-data constant, and the old app never had the page |
| Response actions (copy / rate) | Copy works; rating is still a placeholder | See "Still open" |
| Chat attachments and "web mode" | Both removed | The composer offered attachments, image generation, deep research and web search, all unwired and none of them things this copilot does; PDFs are saved on `/capture` |
| AI usage logs placement | User-facing route | It is the reader's own spend, and the workspace is the boundary anyway |
| Graph canvas state (pin / dismiss / layout) | Session-local | Persisting it would be a new capability, not a restoration |
| Gap dismissal | One-way, matching the old app | |
| Domain term: note vs. wiki page | Both are in use — "All Notes" in the nav, "wiki page" in the compiler and the API | See "Still open" |

## Still open

- **Rating an answer does nothing.** The thumbs-up/down buttons in
  `features/agent/components/message-view.tsx` have no handler. Either wire them
  to something that reads the feedback, or remove them — a visible button that
  does nothing reads as broken, not as coming soon.
- **Two names for one thing.** The nav says "All Notes", the API and the
  compiler say "wiki page", and `/[slug]` serves it. Pick one and make the
  product agree with itself.
- **Accessible topic index for the graph.** The canvas has keyboard controls but
  there is still no non-canvas list of topics and their connections.

## Constraints that still apply

Repo-wide engineering preferences live in `CLAUDE.md`; these are the ones this
migration established.

- **shadcn is the only component vocabulary.** Every page composes primitives
  from `packages/ui`. The old app's CSS classes (`font-read`, `eyebrow`,
  `ink-muted`, `paper-grain`) do not exist here and must not be reintroduced —
  including in ported files, where copying the markup is tempting.
- **Animate only where it earns its place.** Something seen a hundred times a
  day gets no animation. Occasional UI (modals, drawers, toasts) gets a standard
  transition. Rare, first-time moments can get delight. "Looks cool" is not a
  reason if it is seen often.
- **Motion mechanics:** `ease-out` for anything entering or leaving, never
  `ease-in`; under 300 ms for UI; never animate from `scale(0)` — start at
  `scale(0.95)` with `opacity: 0`; popovers scale from their trigger, modals
  stay centred; animate `transform` and `opacity` only; respect
  `prefers-reduced-motion` by dropping movement while keeping opacity and
  colour.
- **Errors are not empty states.** The old app frequently rendered a failed
  request as an empty list. Every query surface here separates the two.

## What parity meant

The bar the migration was held to: a signed-in reader can select a workspace,
capture a source, watch it compile, inspect the structured result, open the
generated page, verify claim-level evidence, ask a cited question about it,
inspect it in the real graph, and roll the page back — all inside the active
workspace, with errors shown separately from empty states.
