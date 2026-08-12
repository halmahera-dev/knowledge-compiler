# 004 - Crossfade inspector content

- **Status**: TODO
- **Commit**: 95de018
- **Severity**: MEDIUM
- **Category**: Missed opportunity
- **Estimated scope**: 2 files, about 20 lines
- **Depends on**: Plan 001

## Problem

The inspector tab marker moves for 160ms, but the Evidence and History bodies replace each other immediately. The large content switch can look abrupt while the smaller marker is still moving.

```tsx
// apps/client/src/features/notes/prototype/notes-ui-prototype.tsx:517 - current
{tab === "evidence" ? (
	<div>
		<p className="notes-eyebrow mt-7">Source excerpts</p>
		{CLAIMS.map((_, index) => (
			<EvidenceCard key={CLAIMS[index].source} index={index} />
		))}
	</div>
) : (
	<div className="mt-7 border-foreground/12 border-l pl-4">
```

## Target

Add a keyed wrapper so each newly selected body receives a short opacity-only entry. Keep the old body unmounted immediately. Do not use `mode="wait"` or animate position.

```tsx
<div key={tab} className="notes-inspector-panel">
	{tab === "evidence" ? (
		<div>
			{/* existing evidence content */}
		</div>
	) : (
		<div className="mt-7 border-foreground/12 border-l pl-4">
			{/* existing history content */}
		</div>
	)}
</div>
```

```css
.notes-inspector-panel {
	opacity: 1;
	transition: opacity var(--notes-duration-fast) ease;
}

@starting-style {
	.notes-inspector-panel {
		opacity: 0;
	}
}
```

Use exactly 100ms. This is frequent tab navigation, so it must stay faster than the 160ms tab-marker movement and must not block interaction.

## Repo conventions to follow

- Use `--notes-duration-fast` from Plan 001.
- The existing selected-tab marker uses `STATE_TRANSITION` with `duration: 0.16` and `cubic-bezier(0.77, 0, 0.175, 1)`.
- Keep inspector content movement-free. Opacity is enough for this crisp dashboard.

## Steps

1. Wrap the current Evidence/History conditional in one `<div key={tab} className="notes-inspector-panel">`.
2. Preserve all current child markup and spacing classes.
3. Add the opacity transition and `@starting-style` rules near `.notes-segmented` in `apps/client/src/index.css`.
4. Do not add an exit phase; old content must unmount immediately.
5. Do not add a special reduced-motion rule because this transition changes opacity only and helps state comprehension.

## Boundaries

- Do NOT use `AnimatePresence`, `mode="wait"`, transform, blur, or height animation.
- Do NOT change `tab` state logic or the selected-tab marker.
- Do NOT change evidence or history content.
- Do NOT touch shared UI files.
- Do NOT add dependencies.
- If Plan 001 is not complete or the excerpt has drifted from commit `95de018`, stop and report it.

## Verification

- **Mechanical**: run `pnpm exec biome check apps/client/src/index.css apps/client/src/features/notes/prototype/notes-ui-prototype.tsx`; run `pnpm --filter client check-types`; run `pnpm --filter client build`. All must pass.
- **Feel check**: switch Evidence and History repeatedly. New content must become clear in 100ms while the marker completes its 160ms move. There must be no blank wait and no double-exposed text.
- In DevTools at 10% playback, confirm the body only changes opacity and the old body is not retained.
- Toggle `prefers-reduced-motion`; the opacity transition may remain because it has no movement.
- **Done when**: inspector content no longer appears abruptly, and rapid tab changes stay responsive.
