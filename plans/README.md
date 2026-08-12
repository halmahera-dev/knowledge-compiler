# Animation Plans

These plans cover motion only for:

- `apps/client/src/app/(app)/page.tsx`
- `apps/client/src/app/(app)/[slug]/page.tsx`
- Their direct notes prototype and notes-specific styles

| Plan | Title | Severity | Status | Dependencies |
| --- | --- | --- | --- | --- |
| 001 | Define notes motion tokens | LOW | TODO | None |
| 002 | Make notes press timing asymmetric | MEDIUM | TODO | 001 |
| 003 | Connect mobile evidence to its claim | MEDIUM | TODO | 001 |
| 004 | Crossfade inspector content | MEDIUM | TODO | 001 |
| 005 | Clarify selected note state | LOW | TODO | 001 |

## Execution Order

1. Execute `001-notes-motion-tokens.md` first. It defines the values used by every other plan.
2. Execute `002-asymmetric-notes-press.md` next because it corrects existing motion.
3. Execute `003-mobile-evidence-entry.md` next because it fixes the clearest abrupt state change.
4. Execute `004-inspector-content-crossfade.md` next.
5. Execute `005-selected-note-state.md` last because it is low-impact polish.

Plans 002 through 005 are independent after Plan 001 and can run in parallel if each executor starts from a branch that contains Plan 001.

## Scope Boundary

Do not use these plans to change the app shell, sidebar, shared buttons, sheets, dropdown menus, or tooltips. The two route files contain no animation and should remain unchanged unless a plan explicitly says otherwise.
