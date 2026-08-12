# 001 - Define notes motion tokens

- **Status**: TODO
- **Commit**: 95de018
- **Severity**: LOW
- **Category**: Cohesion and tokens
- **Estimated scope**: 2 files, about 20 lines

## Problem

The notes UI repeats one duration and related easing values in CSS, a Tailwind class, and Motion configuration. This makes later tuning uneven.

```tsx
// apps/client/src/features/notes/prototype/notes-ui-prototype.tsx:164 - current
const STATE_TRANSITION = {
	type: "tween",
	duration: 0.16,
	ease: [0.77, 0, 0.175, 1],
} as const;
```

```tsx
// apps/client/src/features/notes/prototype/notes-ui-prototype.tsx:473 - current
<ArrowRight
	className={`mt-0.5 ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-160 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none ${openClaim === index ? "rotate-90" : ""}`}
/>
```

```css
/* apps/client/src/index.css:83 and 113 - current */
transition:
	background-color 160ms ease,
	border-color 160ms ease,
	box-shadow 160ms ease;

transition:
	transform 100ms ease-out,
	background-color 160ms ease-out,
	color 160ms ease-out;
```

## Target

Define notes-local CSS tokens at the top of `apps/client/src/index.css`. Do not add global package tokens because this plan is limited to these note routes.

```css
:root {
	--notes-duration-fast: 100ms;
	--notes-duration-state: 160ms;
	--notes-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
	--notes-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
}
```

Use `var(--notes-duration-state)` for search color, border, and shadow transitions. Use `var(--notes-ease-out)` for entering, exiting, and press transitions. Use `var(--notes-ease-in-out)` for the claim arrow and selected-tab movement.

Motion JavaScript values cannot consume CSS custom properties safely as numeric transition values. Keep `STATE_TRANSITION`, but add this comment directly above it:

```tsx
// Keep these values aligned with the notes motion tokens in index.css.
```

Keep its exact values as `duration: 0.16` and `ease: [0.77, 0, 0.175, 1]`.

## Repo conventions to follow

- Notes-specific styles already live in `apps/client/src/index.css` under `.notes-*` selectors.
- `STATE_TRANSITION` in `apps/client/src/features/notes/prototype/notes-ui-prototype.tsx:164` is the existing Motion transition object.
- Keep the dashboard crisp. Do not add bounce or a duration above 160ms.

## Steps

1. Add the four `--notes-*` tokens near the top of `apps/client/src/index.css`, after its import.
2. Replace notes CSS occurrences of `100ms`, `160ms`, built-in `ease-out`, `cubic-bezier(0.23, 1, 0.32, 1)`, and `cubic-bezier(0.77, 0, 0.175, 1)` with the correct tokens when those values control notes motion.
3. Replace the claim arrow Tailwind duration and easing utilities with a notes-specific class, such as `notes-claim-arrow`, defined in `apps/client/src/index.css` with the token values.
4. Add the alignment comment above `STATE_TRANSITION`. Do not change its values.
5. Keep the existing reduced-motion rule for the claim arrow through `.notes-claim-arrow`.

## Boundaries

- Do NOT touch either route file. They contain no motion.
- Do NOT touch `packages/ui`, the app shell, sidebar, dropdown, sheet, or tooltip code.
- Do NOT add tokens to `packages/ui/src/styles/globals.css`.
- Do NOT change visual behavior in this plan.
- Do NOT add dependencies.
- If the excerpts no longer match commit `95de018`, stop and report the drift.

## Verification

- **Mechanical**: run `pnpm exec biome check apps/client/src/index.css apps/client/src/features/notes/prototype/notes-ui-prototype.tsx`; run `pnpm --filter client check-types`; run `pnpm --filter client build`. All must pass.
- **Feel check**: compare search focus, button presses, claim arrow rotation, and inspector tab movement before and after. Timing must look unchanged.
- Toggle `prefers-reduced-motion`; button movement and arrow rotation must remain removed while color feedback remains.
- **Done when**: notes motion values come from the four CSS tokens where CSS controls motion, `STATE_TRANSITION` is documented as the JavaScript mirror, and behavior is unchanged.
