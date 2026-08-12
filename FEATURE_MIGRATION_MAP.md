# Web Feature Migration Map

This map compares the old `apps/web` implementation with the new root
`apps/web`. It describes product behavior to preserve. It does not require a
file-for-file port.

## Source Note

`old/apps/web` is absent from the copied `old/` directory. The old web source is
still available in the current Git `HEAD` as deleted files. Old references in
this document use `HEAD:apps/web/...`. New references use current workspace
paths.

## Status

| Status | Meaning |
| --- | --- |
| Keep | The new app has the required behavior. |
| Adapt | The new app has useful work, but it does not meet the old behavior yet. |
| Restore | The old behavior is missing from the new app. |
| Decide | Product intent or backend ownership must be confirmed before work starts. |

## Product Core

| Area | Old behavior to preserve | New app state | Status | Main gap |
| --- | --- | --- | --- | --- |
| Authentication | Email/password sign-in and sign-up, safe return to the requested app route, and automatic first workspace selection or creation. | Login and register call Better Auth and redirect to `/`. | Adapt | App routes have no session guard. There is no safe deep-link return or workspace setup. Logout does not end the session. |
| Session protection | Every product route except `/` and `/signin` required a valid session. | `/`, `/agent`, `/graph`, and `/statistics` are public. An unused session helper exists. | Restore | Add route guards and redirect signed-in users away from auth screens. |
| Workspaces | Users could list, create, and switch active workspaces. API tokens and route data changed with the active workspace. | No workspace UI or active-workspace flow. Chat identity uses a browser-local random ID. | Restore | Make workspace the main scope for captures, pages, graph, gaps, and conversations. |
| Account menu | Show real session data and sign out through Better Auth. | Fixed user name, email, and avatar. Account and Notifications do nothing. Logout only navigates. | Restore | Connect session data, sign-out, and useful account actions. |
| App shell | Responsive navigation for Capture, Wiki, Ask, Graph, Gaps, and AI Logs. | Responsive sidebar for All Notes, Agent, Graph View, and Statistics. | Adapt | Keep the new shell, but restore the old product destinations and active-workspace control. |
| Theme | System theme by default, with light and dark choices saved locally. | Dark and system work. Light is disabled behind a fixed `Pro` label. | Adapt | Restore light mode unless a real entitlement rule exists. |
| Public landing | Explain capture-to-compile behavior with a static interactive compile example and product calls to action. | `/` is an authenticated-shell placeholder that prints `Hello "/_app/"!`. | Decide | Choose whether `/` is a public landing page or the signed-in note index. Do not keep it as a placeholder. |

Old evidence: `HEAD:apps/web/src/routes/signin.tsx`,
`HEAD:apps/web/src/lib/guards.ts`,
`HEAD:apps/web/src/components/workspace-menu.tsx`,
`HEAD:apps/web/src/components/sidebar.tsx`, and
`HEAD:apps/web/src/routes/index.tsx`.

New evidence: `apps/web/src/routes/_auth/login.tsx`,
`apps/web/src/routes/_auth/register.tsx`,
`apps/web/src/routes/_app/route.tsx`,
`apps/web/src/components/sidebar/app-sidebar.tsx`, and
`apps/web/src/components/sidebar/nav-user.tsx`.

## Capture And Compile

| Feature | Old behavior to preserve | New app state | Status |
| --- | --- | --- | --- |
| Paste capture | Save a text excerpt and compile it. Blank input was blocked and Ctrl/Cmd+Enter submitted. | No route, client, or UI. | Restore |
| Link capture | Save an HTTP/HTTPS URL and compile extracted readable text. Enter submitted. | No route, client, or UI. | Restore |
| PDF capture | Browse or drag a PDF, validate type and 40 MB size, upload it, and report extraction errors or split compile jobs. | Chat shows a file menu item, but it has no handler. | Restore |
| Browser extension entry | Explain extension capture and issue a workspace-scoped token from `/api/auth/token`. | No extension panel or token route. | Restore |
| Duplicate feedback | Report that content was already saved and link to its compiled page when possible. | Missing. | Restore |
| Compile history | Load recent runs for the active workspace. | Missing. | Restore |
| Live compile feed | Receive SSE updates through extract, match, compile, link, and persist stages. | Missing. | Restore |
| Compile result | Show create, merge, or addendum action, page revision, reasoning, claim totals, disputes, concepts, edges, sections, and gaps. | Missing. | Restore |
| Failure and retry | Show failed or stalled runs and let valid historical runs be queued again. | Missing. | Restore |
| Accessible capture tabs | Arrow keys, Home, and End changed capture modes with correct tab semantics. | No capture tabs. | Restore |

Old evidence: `HEAD:apps/web/src/routes/capture.tsx`,
`HEAD:apps/web/src/components/compile-diff.tsx`,
`HEAD:apps/web/src/hooks/use-tablist.ts`, and
`HEAD:apps/web/src/lib/api.ts`.

The capture screen is the main entry to the old product loop. It should return
before graph and statistics work is connected because it creates the data those
screens need.

## Compiled Wiki

| Feature | Old behavior to preserve | New app state | Status |
| --- | --- | --- | --- |
| Page index | List compiled pages with summary, source count, claim count, dispute count, and local filtering. | Sidebar calls `/` "All Notes," but the route is a placeholder. | Restore |
| Page detail | Render page summary, sections, claims, revision, and totals. | Missing. | Restore |
| Claim provenance | Expand each claim to show exact source quotes and safe source links. | Missing. | Restore |
| Contradictions | Mark disputed claims and identify contradicting source evidence. | Missing. | Restore |
| Sources | List source type and capture date for each page. | Missing. | Restore |
| Backlinks | Link related compiled pages from the page detail. | Missing. | Restore |
| Revision history | List prior revisions with compile action and date. | Missing. | Restore |
| Rollback | Revert to a prior revision and reload the resulting page and graph state. | Missing. | Restore |
| Historical preview | The old API client could load a revision, but the old UI did not expose it. | Missing. | Decide |
| Manual editing | Old pages were agent-maintained and did not support rich editing. | Missing. | Keep missing unless product scope changed. |

Old evidence: `HEAD:apps/web/src/routes/wiki.index.tsx`,
`HEAD:apps/web/src/routes/wiki.$slug.tsx`, and
`HEAD:apps/web/src/lib/url.ts`.

The old UI called these records wiki pages. The new sidebar calls them notes.
Choose one domain term before adding routes and APIs. The data is compiled output,
not a normal user-authored note.

## Ask And Agent

| Feature | Old behavior to preserve | New app state | Status |
| --- | --- | --- | --- |
| Saved conversations | List, open, create, and delete conversations scoped to the active workspace. | Threads can be listed and opened. Rename/delete logic exists, but its UI is not mounted. | Adapt |
| Multi-turn questions | Ask follow-up questions with prior context. | Streaming multi-turn chat works. | Keep |
| Workspace grounding | Answer only from compiled pages in the active workspace. | Requests use a random browser `resourceId`, not session and workspace identity. | Restore |
| Inline citations | Link answer markers to the compiled page that supports the claim. | Rich response rendering exists, but old claim citations are not mapped. | Restore |
| Consulted evidence | Expand a list of consulted claims, exact quotes, pages, and dispute state. | A general reasoning/tool inspector exists. It is not a provenance view. | Adapt |
| Refusal | Clearly state when an answer is not supported by workspace knowledge. | Controlled by the external agent; no verified product state. | Restore |
| Error recovery | Keep the question visible and offer retry after failure. | Streaming errors show Retry. | Keep |
| Pending and stream states | Show work in progress and the completed answer. | Streaming, `Thinking...`, auto-scroll, and load states work. | Keep |
| Stop generation | Stop an active response. | Stop logic is passed into the composer, but the button is commented out. | Restore |
| Thread management | Rename and delete a thread. | API hooks and a thread-list component exist, but the component is unreachable. | Adapt |
| Response actions | Copy and rate an answer. | Buttons are visible but have no handlers. | Decide |
| Attachments and web modes | Not part of the old Ask screen. | Menu items are visible but have no handlers. | Decide or remove placeholders. |

Old evidence: `HEAD:apps/web/src/routes/ask.tsx`,
`HEAD:apps/web/src/lib/copilot.ts`, and
`HEAD:apps/web/src/lib/markdown.tsx`.

New evidence: `apps/web/src/routes/_app/agent/index.tsx`,
`apps/web/src/routes/_app/agent/$id.tsx`,
`apps/web/src/components/chat/message-view.tsx`,
`apps/web/src/components/chat/message-inspector.tsx`, and
`apps/web/src/hooks/use-threads.ts`.

The new chat UI is the best part to keep. Change its identity and data contract
instead of restoring the old non-streaming UI.

## Graph, Gaps, And Operations

| Feature | Old behavior to preserve | New app state | Status |
| --- | --- | --- | --- |
| Real topic graph | Load workspace graph nodes and typed edges from the product API. | Strong interactive graph uses fixed `SAMPLE_GRAPH` data. | Adapt |
| Typed relations | Show `extends`, `contradicts`, `prerequisite_of`, and `example_of` with direction. | Sample graph supports labels and relationship inspection. | Adapt |
| Page navigation | Open a compiled page from a graph topic. | Node inspector has no compiled-page route to open. | Restore |
| Canvas controls | Pan, zoom, fit, restart, select, drag, pin, dismiss, expand, and use keyboard controls. | Better than the old canvas and should be kept. | Keep |
| Accessible topic index | Provide a non-canvas list of topics and directional connections with page links. | Missing. The canvas has keyboard controls but no equivalent readable index. | Restore |
| Graph persistence | Old graph came from backend data; canvas changes were not user edits. | Pin, dismiss, expand, and layout changes are local only. | Decide |
| Knowledge gaps | List compiler-discovered prerequisites with reasons and related topic links. Allow dismissal. | Missing. | Restore |
| AI usage logs | Show model calls, tokens, cost, duration, operation totals, and failures. | Missing. | Restore or move to an admin/operator surface. |
| Statistics | No old web equivalent. | Polished dashboard uses fixed sample data. | Decide and connect only after product metrics are defined. |

Old evidence: `HEAD:apps/web/src/routes/graph.tsx`,
`HEAD:apps/web/src/lib/graph-index.ts`,
`HEAD:apps/web/src/routes/gaps.tsx`, and
`HEAD:apps/web/src/routes/ai-logs.tsx`.

New evidence: `apps/web/src/routes/_app/graph/index.tsx`,
`apps/web/src/components/graph/graph-viewer.tsx`,
`apps/web/src/components/graph/sample-data.ts`, and
`apps/web/src/routes/_app/statistics/index.tsx`.

## Cross-Cutting Behavior

| Area | Old behavior to preserve | New app state | Status |
| --- | --- | --- | --- |
| Role-aware UI | Viewer, member, admin, and owner abilities were defined, though old screen enforcement was incomplete. | No product role model in the web UI. | Restore correctly, without copying old mismatches. |
| Workspace API token | Use a short-lived JWT with user, workspace, and role for API requests. Clear it after sign-out or workspace switch. | Better Auth handles auth forms, but product API calls are not workspace scoped. | Restore or replace with an equally safe server-session design. |
| Safe source URLs | Only HTTP and HTTPS values became links. Storage paths and unsafe schemes stayed plain text. | No source UI. | Restore with the source features. |
| Route loading | Delayed global loading UI prevented short flashes. | A global loader exists. | Keep and verify on new data routes. |
| Route errors | Product error and not-found pages offered retry. | Basic not-found and loader behavior exists; product data routes are limited. | Adapt |
| Empty versus error | The old app often hid API failures as empty lists. | New query-based chat has better loading and error states. | Do not copy the old flaw. |
| Guided tour | Highlight visible controls on the current route with keyboard navigation. | Missing. | Restore after final route and control names are stable. |
| Responsive behavior | Desktop sidebar, mobile drawer, backdrop, Escape close. | Shared sidebar supports desktop and mobile. | Keep |
| Tests | Pure logic tests covered redirects, Markdown, graph phrasing, tab keyboard behavior, formatting, URLs, and service config. | No web tests or test script. | Restore tests for migrated behavior. |

## Route Map

| Old route | New target | Current state |
| --- | --- | --- |
| `/` | Public landing or redirect to the signed-in page index | Placeholder app overview; decision required. |
| `/signin` | `/login` and `/register` | Forms exist; session, redirect, and workspace behavior are incomplete. |
| `/capture` | `/capture` | Missing. |
| `/wiki` | `/` or `/pages` | Missing. `/` is labeled All Notes but has no list. |
| `/wiki/$slug` | `/pages/$slug` or `/notes/$slug` | Missing. Choose the domain term first. |
| `/ask` | `/agent` and `/agent/$id` | UI exists; workspace grounding and citations are missing. |
| `/graph` | `/graph` | UI exists with sample data only. |
| `/gaps` | `/gaps` | Missing. |
| `/ai-logs` | `/ai-logs` or an admin route | Missing; product placement requires a decision. |
| `/api/auth/$` | `/api/auth/$` | Present. |
| `/api/auth/token` | Same route or server-side product API proxy | Missing. |
| None | `/statistics` | New sample-data prototype. |
| None | `/forgot-password` | New placeholder. Either implement it or remove the link. |

## Migration Order

1. Fix auth boundaries: session guards, real logout, session-backed account data,
   safe redirects, and auth-screen redirects.
2. Restore workspace selection and establish one workspace-scoped product API
   client contract.
3. Restore capture for paste and link, then compile history and live run status.
4. Restore the compiled page index and page detail with claim provenance.
5. Restore PDF and extension capture, duplicate feedback, failure states, and
   retry.
6. Connect the new Agent UI to workspace conversations, compiled-page grounding,
   citations, and consulted evidence.
7. Connect the new Graph UI to real workspace data and add the accessible topic
   index.
8. Restore revision history, rollback, and knowledge gaps.
9. Decide the public landing page, AI Logs placement, statistics metrics,
   response feedback, and attachment modes.
10. Restore the guided tour and add route-level and integration tests after the
    product routes are stable.

## Design & Engineering Constraints

Migration-specific guardrails only — see `CLAUDE.md` for repo-wide engineering
preferences, not restated here.

- **shadcn is the only component vocabulary.** Every page composes shadcn
  primitives (`packages/ui`, e.g. `@kc/ui/components/empty`). No hand-rolled
  buttons/dialogs/menus, and no porting the old `apps/web` CSS classes
  (`font-read`, `eyebrow`, `ink-muted`, etc.) — that vocabulary does not exist
  in this codebase and should not be reintroduced.
- **Animate only where it earns its place.** Something seen 100+ times a day
  (keyboard actions, list navigation) gets no animation. Occasional UI
  (modals, drawers, toasts, dismiss) gets a standard transition. Rare/first-
  time moments (onboarding, empty states) can get delight. Every animation
  must answer "why" — spatial consistency, state indication, feedback, or
  preventing a jarring appear/disappear. "Looks cool" is not a reason if it's
  seen often.
- **Motion mechanics, non-negotiable:**
  - `ease-out` for anything entering/exiting, never `ease-in`.
  - Stay under 300ms for UI (buttons 100–160ms, popovers 125–200ms,
    dropdowns 150–250ms, modals 200–500ms).
  - Never animate from `scale(0)` — start at `scale(0.95)` + `opacity: 0`.
  - Popovers scale from their trigger (`transform-origin`); modals stay
    centered.
  - Only animate `transform` and `opacity`; avoid animating layout
    properties.
  - Buttons get `scale(0.97)` on `:active` for press feedback.
  - Gate hover animations behind `@media (hover: hover) and (pointer: fine)`.
  - Respect `prefers-reduced-motion` — keep opacity/color transitions, drop
    movement.
- **Restore behavior before restoring look.** The `Restore` rows above are
  about behavior parity (claim provenance, citations, workspace scoping).
  Get behavior right against the old app first; apply the polish rules above
  after — don't gold-plate a feature that isn't functionally correct yet.
- **Capture goes through the Agent, not a dedicated page.** See
  `docs/adr/0001-capture-through-agent-not-dedicated-page.md`. This overrides
  the Capture And Compile section above where it assumes a restored
  `/capture` route — the *behaviors* in that table (paste/link/PDF input,
  duplicate feedback, live compile feed, failure/retry) still apply, just
  surfaced inside the chat flow instead of a separate page.

## Domain Terms Resolved

- **Note vs. wiki page** — settled. "Note" is canonical (`apps/client`
  already routes it this way, at `/[slug]`). "Wiki page" was the old
  `apps/web` name for the same concept. See `CONTEXT.md`.
- **Gap link target** — settled. A gap's `nodeSlug` links to `/[slug]`
  (the Note it was raised from), not `/wiki/$slug`.

## Open Decisions (recommendations, not final)

These are the `Decide` rows above, restated with a recommended default. The
next person can act on the recommendation or override it — either way, the
map should be updated with whichever was chosen.

| Decision | Recommendation | Why |
| --- | --- | --- |
| `/` identity: public landing vs. signed-in note index | Signed-in note index | The app has no marketing/landing content built yet; a placeholder public page is worse than routing straight to the product for now. Add a real landing page as a separate, later decision. |
| Expose historical-revision preview in UI | Not yet | The old API client supported it but the old UI never exposed it either — no evidence of user demand, and revision history + rollback (its prerequisites) aren't built yet. |
| Response actions (copy/rate): build or remove placeholders | Remove until built | Visible buttons with no handler read as broken, not "coming soon." |
| Attachments / web modes in chat: build or remove placeholders | Keep attachments (PDF capture now routes through chat per ADR 0001), remove "web mode" until scoped | Attachments are now load-bearing for Capture; web mode has no defined behavior anywhere in the old app or the map. |
| Graph canvas state (pin/dismiss/expand/layout) persistence | Keep session-local | Old graph state was never persisted either; making it persist is a new capability, not a restoration, and should be its own decision once the real graph data (E1) lands. |
| Gaps: dismiss recoverable, or one-way like old | One-way, matches old | Answered during this session — 1:1 parity was the agreed scope for Gaps specifically. |
| AI usage logs: user-facing route vs. admin/operator surface | Admin/operator surface | Cost/token data is an operator concern, not something most users act on day to day; keeping it out of primary nav keeps the product surface focused. |
| Statistics: wire to real metrics, or strip the sample-data prototype | Strip it | Shipping a dashboard with fake data risks being mistaken for real data. Rebuild once product metrics are actually defined (per the table above, this was never in old `apps/web` to begin with). |

## Minimum Migration Completion

The migration reaches feature parity when a signed-in user can select a
workspace, capture a source, watch it compile, inspect the structured result,
open the generated page, verify claim-level evidence, ask a cited question about
it, inspect it in the real graph, and roll the page back. All these actions must
stay inside the active workspace and must show errors separately from empty
states.

Statistics, response ratings, chat attachments, account notifications, billing
labels, and historical revision previews are not required for old web parity.
