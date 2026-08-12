# 002 - Make notes press timing asymmetric

- **Status**: TODO
- **Commit**: 95de018
- **Severity**: MEDIUM
- **Category**: Interruptibility and timing
- **Estimated scope**: 1 file, about 12 lines
- **Depends on**: Plan 001

## Problem

Every `.notes-press` control uses the same transform transition while the pointer goes down and while it releases. The deliberate press and the system response therefore have symmetric timing.

```css
/* apps/client/src/index.css:113 - current */
.notes-press {
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
	transition:
		transform 100ms ease-out,
		background-color 160ms ease-out,
		color 160ms ease-out;
}

.notes-press:active {
	transform: scale(0.975);
}
```

## Target

The release must snap in 100ms. The deliberate active phase must use 160ms. Use the tokens from Plan 001.

```css
.notes-press {
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
	transition:
		transform var(--notes-duration-fast) var(--notes-ease-out),
		background-color var(--notes-duration-state) ease,
		color var(--notes-duration-state) ease;
}

.notes-press:active {
	transform: scale(0.97);
	transition-duration:
		var(--notes-duration-state),
		var(--notes-duration-state),
		var(--notes-duration-state);
}
```

The first duration maps to `transform`; the next two map to background and color. Keep the reduced-motion behavior: no transform, but color feedback remains.

## Repo conventions to follow

- Use the notes-local tokens created by `plans/001-notes-motion-tokens.md`.
- The current `.notes-press` rule at `apps/client/src/index.css:113` is shared by note rows, claim controls, links, and inspector tabs.
- The approved press scale range is `0.95-0.98`; use exactly `0.97`.

## Steps

1. Change the base transform release to `var(--notes-duration-fast) var(--notes-ease-out)`.
2. Change background and color transitions to `var(--notes-duration-state) ease` because these are color changes.
3. Change active scale from `0.975` to `0.97`.
4. Add active-state `transition-duration` so transform uses 160ms while pressed.
5. Confirm the existing reduced-motion block still removes transform and keeps background and color transitions.

## Boundaries

- Do NOT change JSX or add event handlers.
- Do NOT change search filtering, route navigation, or inspector state logic.
- Do NOT touch shared buttons in `packages/ui`.
- Do NOT add dependencies.
- If Plan 001 is not complete or the excerpt has drifted from commit `95de018`, stop and report it.

## Verification

- **Mechanical**: run `pnpm exec biome check apps/client/src/index.css`; run `pnpm --filter client check-types`; run `pnpm --filter client build`. All must pass.
- **Feel check**: press and release a desktop note row, claim card, inspector tab, and “Open full note” link. The press must settle over 160ms; release must return faster in 100ms.
- In DevTools, set animation playback to 10% and confirm no scale jump occurs when a press reverses early.
- Toggle `prefers-reduced-motion`; scale must disappear while background and color feedback remain.
- **Done when**: press and release have visibly different timing without delaying clicks or navigation.
