---
status: accepted
---

# Capture happens through the Agent, not a dedicated Capture page

Old `apps/web` had a standalone `/capture` route: tabs for paste/link/PDF
input, submit, and a live SSE compile feed shown beside it
(`HEAD:apps/web/src/routes/capture.tsx`). `apps/client` migrates this
capability into the existing Agent chat interface instead of restoring a
separate form-based page — paste text, paste a link, or attach a PDF into the
same chat surface used for asking questions, and the agent compiles it from
there. This reverses the assumption in `FEATURE_MIGRATION_MAP.md`'s Capture
And Compile section, which was written against the old page-based flow.
Chosen because the new app already has a capable chat surface with an
unused file-attach menu item (`apps/client` agent chat, noted as a handler
gap in the migration map); building a second, parallel input surface for the
same underlying action (save something, watch it compile) would duplicate UI
the app already has. The old page's virtue — a live compile feed next to the
input — still needs to be preserved, just surfaced inside the chat flow
(e.g. as a compile-status message) rather than as a separate pane.
