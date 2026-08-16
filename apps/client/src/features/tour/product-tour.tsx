"use client";

import { Button } from "@kc/ui/components/button";
import type { CSSProperties, ReactNode, Ref } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TOUR_STEPS, type TourStep } from "@/features/tour/steps";

/**
 * The guided tour behind the sidebar's Visual help button.
 *
 * Anchored to real elements rather than shown as a slideshow of screenshots:
 * the point is to show where a thing *is*, and a picture of the interface
 * teaches nothing about the interface you are looking at. Each step highlights
 * its target in place and explains it beside it.
 *
 * Steps whose target is absent are skipped rather than shown pointing at
 * nothing — the composer only exists on /agent, the activity feed only on the
 * home page, and on a phone the nav lives in a drawer that is unmounted while
 * shut.
 */

interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
}

function elementFor(target: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}

function boxFor(target: string): Box | null {
	const element = elementFor(target);
	if (!element) return null;

	const rect = element.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) return null;
	return {
		top: rect.top,
		left: rect.left,
		width: rect.width,
		height: rect.height,
	};
}

export function ProductTour({ onClose }: { onClose: () => void }) {
	// Null until measured. The App Router prerenders client components on the
	// server, where there is no `document` — and even in the browser, filtering
	// during render would read the DOM before this frame is committed. Rendering
	// nothing until then also keeps the "nothing to point at" card from flashing
	// on a page that does have targets.
	const [steps, setSteps] = useState<TourStep[] | null>(null);
	const [index, setIndex] = useState(0);
	const [box, setBox] = useState<Box | null>(null);
	const dialogRef = useRef<HTMLDivElement | null>(null);

	useLayoutEffect(() => {
		setSteps(TOUR_STEPS.filter((step) => boxFor(step.target) !== null));
	}, []);

	const step = steps?.[index];

	// Measured after layout so the highlight is never a frame behind the element.
	// The scroll listener is on `window` in the **capture** phase: the scrolling
	// container is SidebarInset, and scroll does not bubble — a bubble-phase
	// listener here would never fire and the highlight would drift away from its
	// target as the page moves.
	useLayoutEffect(() => {
		if (!step) return;
		const measure = () => setBox(boxFor(step.target));
		measure();
		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, true);
		return () => {
			window.removeEventListener("resize", measure);
			window.removeEventListener("scroll", measure, true);
		};
	}, [step]);

	// A target below the fold is a step pointing at something the reader cannot
	// see. Scrolled into view rather than skipped: it is on this page, it is just
	// further down.
	useEffect(() => {
		if (!step) return;
		const element = elementFor(step.target);
		if (!element) return;
		const rect = element.getBoundingClientRect();
		if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
		element.scrollIntoView({ block: "center", behavior: "smooth" });
	}, [step]);

	useEffect(() => {
		dialogRef.current?.focus();
	}, []);

	useEffect(() => {
		const count = steps?.length ?? 0;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
			if (event.key === "ArrowRight")
				setIndex((i) => Math.min(i + 1, count - 1));
			if (event.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose, steps?.length]);

	if (steps === null) return null;

	if (!step) {
		return (
			<Scrim onClose={onClose}>
				<Panel ref={dialogRef}>
					<p className="font-semibold text-base">Nothing to point at here.</p>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						Open the app and try again — the tour highlights real controls
						rather than showing pictures of them.
					</p>
					<Button className="mt-5" onClick={onClose}>
						Close
					</Button>
				</Panel>
			</Scrim>
		);
	}

	const last = index === steps.length - 1;

	return (
		<Scrim onClose={onClose}>
			{/* The cut-out. A ring plus a shadow spread large enough to dim the rest
			    of the page, so one element is lit without compositing two layers. */}
			{box ? (
				<div
					aria-hidden="true"
					className="pointer-events-none fixed z-[60] rounded-lg ring-2 ring-primary transition-all duration-200"
					style={{
						top: box.top - 4,
						left: box.left - 4,
						width: box.width + 8,
						height: box.height + 8,
						boxShadow:
							"0 0 0 9999px color-mix(in oklch, var(--color-foreground) 55%, transparent)",
					}}
				/>
			) : null}

			<Panel ref={dialogRef} style={placementFor(box)}>
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-wider">
					{index + 1} of {steps.length}
				</p>
				<p className="mt-1.5 font-semibold text-base leading-snug">
					{step.title}
				</p>
				<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
					{step.body}
				</p>

				<div className="mt-5 flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						disabled={index === 0}
						onClick={() => setIndex((i) => i - 1)}
					>
						Back
					</Button>
					<Button
						size="sm"
						onClick={() => (last ? onClose() : setIndex((i) => i + 1))}
					>
						{last ? "Done" : "Next"}
					</Button>
					<Button
						variant="link"
						size="sm"
						className="ml-auto text-muted-foreground text-xs"
						onClick={onClose}
					>
						Skip
					</Button>
				</div>
			</Panel>
		</Scrim>
	);
}

/**
 * Keeps the card near its target without covering it.
 *
 * Below the highlight when there is room, above when there is not, and clamped
 * to the viewport so a target near an edge does not push the card off-screen.
 */
function placementFor(box: Box | null): CSSProperties {
	if (typeof window === "undefined" || !box) {
		return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
	}

	const CARD = { width: 320, height: 210, gap: 16 };
	const below = box.top + box.height + CARD.gap;
	const fitsBelow = below + CARD.height < window.innerHeight;

	return {
		top: fitsBelow
			? below
			: Math.max(CARD.gap, box.top - CARD.height - CARD.gap),
		left: Math.min(
			Math.max(CARD.gap, box.left + box.width / 2 - CARD.width / 2),
			window.innerWidth - CARD.width - CARD.gap,
		),
		width: CARD.width,
	};
}

/**
 * Everything the tour draws goes to `document.body`.
 *
 * `position: fixed` escapes an ancestor's `overflow: hidden` — which
 * SidebarProvider sets — but not a containing block created by an ancestor
 * transform, and the sidebar animates. Portalled, the highlight is positioned
 * against the viewport it was measured in.
 */
function Scrim({
	children,
	onClose,
}: {
	children: ReactNode;
	onClose: () => void;
}) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	if (!mounted) return null;

	return createPortal(
		// Clicking away is the fastest exit and the one people try first. Only a
		// click on the scrim itself closes — a click that landed on the card
		// bubbles up here, and dismissing on it would make the Back button close
		// the tour instead of stepping back.
		// biome-ignore lint/a11y/noStaticElementInteractions: a click-away scrim has no role of its own; the keyboard exits are Escape and Skip.
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape is bound at the document, so a key handler here would be a second path to the same exit.
		<div
			className="fixed inset-0 z-[55]"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			{children}
		</div>,
		document.body,
	);
}

function Panel({
	children,
	style,
	ref,
}: {
	children: ReactNode;
	style?: CSSProperties;
	ref?: Ref<HTMLDivElement>;
}) {
	return (
		<div
			ref={ref}
			role="dialog"
			aria-modal="true"
			aria-label="Product tour"
			tabIndex={-1}
			style={style}
			className="fixed z-[61] max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg"
		>
			{children}
		</div>
	);
}
