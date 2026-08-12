# 003 - Connect mobile evidence to its claim

- **Status**: TODO
- **Commit**: 95de018
- **Severity**: MEDIUM
- **Category**: Missed opportunity
- **Estimated scope**: 2 files, about 25 lines
- **Depends on**: Plan 001

## Problem

On screens below `lg`, the claim arrow rotates, but the related evidence card mounts at once. The content teleports below the trigger, so the arrow and content do not feel like one disclosure.

```tsx
// apps/client/src/features/notes/prototype/notes-ui-prototype.tsx:473 - current
<ArrowRight
	className={`mt-0.5 ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-160 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none ${openClaim === index ? "rotate-90" : ""}`}
/>
```

```tsx
// apps/client/src/features/notes/prototype/notes-ui-prototype.tsx:477 - current
{openClaim === index ? (
	<div className="lg:hidden">
		<EvidenceCard index={index} compact />
	</div>
) : null}
```

## Target

Use CSS entry motion only. Do not animate height. Keep the card mounted only while open, and apply `@starting-style` to its wrapper.

```tsx
{openClaim === index ? (
	<div className="notes-evidence-disclosure lg:hidden">
		<EvidenceCard index={index} compact />
	</div>
) : null}
```

```css
.notes-evidence-disclosure {
	opacity: 1;
	transform: translateY(0);
	transition:
		opacity var(--notes-duration-state) var(--notes-ease-out),
		transform var(--notes-duration-state) var(--notes-ease-out);
}

@starting-style {
	.notes-evidence-disclosure {
		opacity: 0;
		transform: translateY(4px);
	}
}

@media (prefers-reduced-motion: reduce) {
	.notes-evidence-disclosure {
		transform: none;
		transition: opacity var(--notes-duration-state) ease;
	}

	@starting-style {
		.notes-evidence-disclosure {
			opacity: 0;
			transform: none;
		}
	}
}
```

This plan adds entry motion only. Closing remains immediate because the element unmounts. Do not reintroduce Motion `AnimatePresence` or layout animation.

## Repo conventions to follow

- Use notes-local tokens from Plan 001.
- `apps/client/src/index.css:220` already contains the notes reduced-motion media query.
- Use only `opacity` and `transform`; never animate `height` or `max-height`.

## Steps

1. Add `notes-evidence-disclosure` to the mobile evidence wrapper in `notes-ui-prototype.tsx`.
2. Add the base and `@starting-style` rules to `apps/client/src/index.css` near the evidence-card styles.
3. Add the opacity-only reduced-motion form inside the existing reduced-motion media query.
4. Do not change `openClaim`, the arrow state, or `EvidenceCard` markup.

## Boundaries

- Do NOT use `AnimatePresence`, keyframes, springs, or JavaScript timers.
- Do NOT animate height, margin, padding, top, or left.
- Do NOT change desktop evidence behavior; the wrapper remains `lg:hidden`.
- Do NOT touch sidebar or shared UI files.
- Do NOT add dependencies.
- If Plan 001 is not complete or the excerpt has drifted from commit `95de018`, stop and report it.

## Verification

- **Mechanical**: run `pnpm exec biome check apps/client/src/index.css apps/client/src/features/notes/prototype/notes-ui-prototype.tsx`; run `pnpm --filter client check-types`; run `pnpm --filter client build`. All must pass.
- **Feel check**: use a viewport below `lg`, open each claim, and confirm the card moves only 4px while fading in over 160ms. It must feel attached to the claim, not like a page entrance.
- Repeatedly open and close claims. Opening must not delay button response; closing must remain immediate.
- In DevTools at 10% playback, confirm only opacity and transform change.
- Toggle `prefers-reduced-motion`; confirm the card uses opacity only and does not move.
- **Done when**: mobile evidence has a small spatial entry with no layout animation and correct reduced-motion behavior.
