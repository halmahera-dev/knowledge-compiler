# 005 - Clarify selected note state

- **Status**: TODO
- **Commit**: 95de018
- **Severity**: LOW
- **Category**: Missed opportunity
- **Estimated scope**: 2 files, about 18 lines
- **Depends on**: Plan 001

## Problem

On desktop, selecting a note removes one absolute background span and mounts another in a different row. The state teleports. The preview must remain immediate, but a very short opacity entry can make the selected row easier to track.

```tsx
// apps/client/src/features/notes/prototype/notes-ui-prototype.tsx:269 - current
<button
	type="button"
	onClick={() => setSelected(note)}
	className="notes-row notes-press relative hidden w-full overflow-hidden text-left md:block"
	aria-pressed={preview?.slug === note.slug}
>
	{preview?.slug === note.slug ? (
		<span className="absolute inset-0 rounded-xl border border-foreground/10 bg-background shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_24px_rgba(0,0,0,.05)]" />
	) : null}
```

## Target

Keep each row's state layer mounted. Change only its opacity through `aria-pressed` selectors. Do not move the layer between rows and do not restore Motion `layoutId`.

```tsx
<span
	aria-hidden="true"
	className="notes-row-selection absolute inset-0 rounded-xl border border-foreground/10 bg-background shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_24px_rgba(0,0,0,.05)]"
/>
```

```css
.notes-row-selection {
	opacity: 0;
	transition: opacity var(--notes-duration-fast) ease;
}

.notes-row[aria-pressed="true"] .notes-row-selection {
	opacity: 1;
}
```

Use exactly 100ms. Do not animate preview content, row layout, or search filtering.

## Repo conventions to follow

- Use `--notes-duration-fast` from Plan 001.
- `.notes-row` and `.notes-press` already define row interaction styles in `apps/client/src/index.css`.
- Keep state motion drastically reduced because note selection can occur tens of times each day.

## Steps

1. Replace the conditional selected background with one always-mounted span in every desktop note button.
2. Add `aria-hidden="true"` because the span is decorative.
3. Add the `notes-row-selection` class without changing its current border, background, radius, or shadow.
4. Add the two CSS opacity rules next to `.notes-row`.
5. Keep preview content replacement immediate and keep filtering free of motion.
6. Keep the opacity transition under reduced motion because it has no position change and shows selection state.

## Boundaries

- Do NOT import `motion`, add `layoutId`, or use a shared-layout animation.
- Do NOT animate row position, scale, height, or preview content.
- Do NOT change `selected`, `visible`, `preview`, or query behavior.
- Do NOT alter mobile note links.
- Do NOT touch shared UI files.
- Do NOT add dependencies.
- If Plan 001 is not complete or the excerpt has drifted from commit `95de018`, stop and report it.

## Verification

- **Mechanical**: run `pnpm exec biome check apps/client/src/index.css apps/client/src/features/notes/prototype/notes-ui-prototype.tsx`; run `pnpm --filter client check-types`; run `pnpm --filter client build`. All must pass.
- **Feel check**: on desktop, select notes slowly and rapidly. The selected background must fade in within 100ms. Preview text must still update immediately.
- Type in search so the selected note leaves the result set. The new fallback selection must update without row movement or delayed filtering.
- In DevTools at 10% playback, confirm only opacity changes on `.notes-row-selection`.
- Toggle `prefers-reduced-motion`; the opacity state transition may remain because it has no movement.
- **Done when**: selected-row state is easier to track without adding motion to filtering, layout, or preview replacement.
