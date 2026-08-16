---
status: superseded by ADR 0003
supersedes: ADR 0001
---

> **Superseded.** Capture happens in the conversation again, and `/capture` is
> deleted. See [0003-capture-returns-to-the-conversation.md](0003-capture-returns-to-the-conversation.md),
> which answers the two objections below rather than dismissing them. The text
> here is the record of a decision that was made, not instructions to follow.

# Capture is its own page

[ADR 0001](0001-capture-through-agent-not-dedicated-page.md) folded capture into
the agent chat: paste, link and PDF would all arrive as chat input, and the
compile would be reported back as a message. `apps/client` ships the opposite —
a `/capture` route with three forms and a live feed beside them — so that ADR is
superseded rather than left to instruct the next reader to undo it.

## What changed the answer

**The copilot is read-only, and that is the product.** It answers only from
claims the workspace has already compiled, cites each one, and refuses when the
claims do not cover the question. Its whole tool set is one search. Giving that
same surface a write path — save this, compile it — makes the boundary a matter
of phrasing: the reader would have to know which sentences are questions about
what has been read and which are instructions to read something new. The
refusal, which is the copilot's most important behaviour, gets harder to trust
the moment the thing refusing can also ingest.

**A compile is not a message.** One save walks five stages (extract, match,
compile, link, persist) and settles into a diff: which page it joined, which
claims were added, what got disputed. Rendered into a transcript, that either
floods the thread with progress lines or collapses into a single line that
throws away the part worth seeing. On `/capture` the feed sits beside the form
and stays put — you can save three things and watch all three land. It also
lives in one place per workspace rather than being scattered across whichever
threads happened to be open, so "what have I saved lately" is a page you visit,
not an archaeology exercise.

**The extension needed somewhere to live.** Clipping happens in the browser, on
a page this app never sees. What the app can offer is the download and the three
steps to load it — a panel, not a conversation.

**Chat still keeps the attachment affordance it had.** Nothing was removed to
make room for this; the file-menu placeholder ADR 0001 was written around is
simply not load-bearing for capture any more.

## Consequences

- `/capture` is a reserved slug. A compiled page titled "Capture" gets
  `capture-2`, enforced in `apps/api/app/services/compile.py` — Next resolves a
  static segment before a dynamic one, so without that a page could make the
  route permanently unreachable.
- The compile feed is one SSE stream per workspace, consumed on one page
  (`apps/client/src/features/capture/`), rather than per thread.
- `FEATURE_MIGRATION_MAP.md`'s Capture And Compile section describes the
  behaviour that shipped, and no longer needs the ADR 0001 caveat.
