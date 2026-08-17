"use client";

import {
	Asteroid02Icon,
	Cursor02Icon,
	HelpCircleIcon,
	NotebookText,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback } from "@kc/ui/components/avatar";
import { buttonVariants } from "@kc/ui/components/button";
import { Card, CardContent } from "@kc/ui/components/card";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CompileDemo } from "@/features/marketing/compile-demo";

/**
 * The landing page, restyled after linear.app: a fixed dark theme, a
 * headline hero with the product proof directly beneath it, a feature grid,
 * social proof and a closing CTA band — the shape the previous version of
 * this file deliberately avoided.
 *
 * The content stays specific rather than generic: the four cards below are
 * the app's own surfaces (same icons as `AppSidebar` — Capture has no
 * dedicated icon here since it has no dedicated route any more; saving now
 * happens inline in the Ask conversation), and the hero's
 * "screenshot" is the real, working `CompileDemo` component, not a mockup.
 * `.dark` is applied on the page's own root rather than relying on the
 * visitor's theme preference, matching linear.app always being dark
 * regardless of OS setting — everything else on this app still follows
 * `ThemeProvider`.
 */

const SURFACES: {
	icon: IconSvgElement;
	title: string;
	body: string;
}[] = [
	{
		icon: NotebookText,
		title: "Wiki",
		body: "Pages that wrote themselves. Every claim keeps the sentence it came from, and every compile is a revision you can roll back.",
	},
	{
		icon: Cursor02Icon,
		title: "Ask",
		body: "Multi-turn conversations, saved per workspace, answered only from compiled pages with the claims cited inline. Paste a link or attach a PDF instead of asking, and it offers to keep it.",
	},
	{
		icon: Asteroid02Icon,
		title: "Graph",
		body: 'Typed edges between what your pages talk about — extends, contradicts, prerequisite of, example of — not one undifferentiated "related to".',
	},
	{
		icon: HelpCircleIcon,
		title: "Gaps",
		body: "Prerequisites noticed while compiling: what your reading assumes but never covers.",
	},
];

const TESTIMONIALS = [
	{
		quote:
			"I stopped losing the thread between papers. The graph shows me where an idea actually comes from.",
		name: "A. Reader",
		role: "Placeholder — Researcher",
	},
	{
		quote:
			"The contradiction flags alone are worth it. My notes used to hide when two sources disagreed.",
		name: "J. Sato",
		role: "Placeholder — Grad student",
	},
	{
		quote:
			"First tool where asking a question feels like checking a citation instead of trusting a summary.",
		name: "M. Okoye",
		role: "Placeholder — Engineer",
	},
] as const;

const FADE_UP = {
	hidden: { opacity: 0, transform: "translateY(12px)" },
	show: { opacity: 1, transform: "translateY(0px)" },
};

function Eyebrow({ children }: { children: ReactNode }) {
	return (
		<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
			{children}
		</p>
	);
}

/**
 * Fades a section up into view once, on scroll. Explanatory/marketing tier —
 * the one place this codebase's default of no-animation-for-content doesn't
 * apply, per `/animate`'s frequency gate: a landing page section is seen once
 * per visit, not tens of times a day.
 */
function Reveal({
	children,
	className,
	stagger = 0,
}: {
	children: ReactNode;
	className?: string;
	stagger?: number;
}) {
	const reduceMotion = useReducedMotion();
	return (
		<motion.div
			className={className}
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-80px" }}
			variants={FADE_UP}
			transition={
				reduceMotion
					? { duration: 0.2 }
					: { duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: stagger }
			}
		>
			{children}
		</motion.div>
	);
}

export function LandingPage() {
	return (
		<div className="dark min-h-svh bg-sidebar">
			<div className="m-2 overflow-hidden rounded-2xl border bg-background shadow-sm">
				{/* Sticky, translucent nav — a material layer over content that
				    scrolls under it, per the apple-design materials guidance,
				    rather than an opaque bar that consumes a fixed strip. */}
				<header className="sticky top-0 z-10 border-border/50 border-b bg-background/70 backdrop-blur-md">
					<div className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-4">
						<span className="font-medium text-sm">Traversa</span>
						<div className="ml-auto flex items-center gap-4">
							<Link
								href="/login"
								className="text-muted-foreground text-sm underline-offset-4 transition-colors hover:text-foreground hover:underline"
							>
								Sign in
							</Link>
							<Link href="/register" className={buttonVariants({ size: "sm" })}>
								Start a workspace
							</Link>
						</div>
					</div>
				</header>

				{/* Hero — headline, pitch, CTA, then the real product proof
				    directly beneath, the way linear.app puts its product shot
				    right under the fold rather than behind a scroll. */}
				<div className="notes-canvas">
					<section className="mx-auto max-w-6xl px-5 pt-16 pb-12 text-center">
						<motion.div
							initial={{ opacity: 0, transform: "translateY(16px)" }}
							animate={{ opacity: 1, transform: "translateY(0px)" }}
							transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
						>
							<Eyebrow>Personal knowledge base</Eyebrow>

							<h1 className="mx-auto mt-4 max-w-3xl font-semibold text-5xl tracking-tight sm:text-6xl">
								Read it once.
								<br />
								It stays read.
							</h1>

							<p className="mx-auto mt-5 max-w-[52ch] text-lg text-muted-foreground leading-relaxed">
								A memory system that helps people who read a lot fold everything
								they read into a self-building, evidence-linked wiki.
							</p>

							<div className="mt-8 flex flex-wrap items-center justify-center gap-4">
								<Link
									href="/register"
									className={buttonVariants({ size: "lg" })}
								>
									Start a workspace
								</Link>
								<Link
									href="/login"
									className="text-muted-foreground text-sm underline-offset-4 transition-colors hover:text-foreground hover:underline"
								>
									I already have one
								</Link>
							</div>
						</motion.div>
					</section>

					{/* The product shot: a real, working component in a framed
					    surface, materialised on mount rather than a plain
					    opacity fade, per the materials guidance. */}
					<motion.div
						className="mx-auto max-w-6xl px-5 pb-20"
						initial={{ opacity: 0, transform: "scale(0.97)" }}
						animate={{ opacity: 1, transform: "scale(1)" }}
						transition={{
							duration: 0.6,
							delay: 0.15,
							ease: [0.23, 1, 0.32, 1],
						}}
					>
						<div className="rounded-3xl border bg-background/60 p-6 shadow-2xl shadow-primary/10 ring-1 ring-foreground/5 sm:p-10">
							<CompileDemo />
						</div>
					</motion.div>
				</div>

				{/* Feature grid — the app's own five surfaces, same icons as
				    `AppSidebar`, so someone who signs up recognises this grid
				    again as the actual nav. */}
				<Reveal className="mx-auto max-w-6xl px-5 pb-20">
					<Eyebrow>Everywhere in the app</Eyebrow>
					<h2 className="mt-2 max-w-[26ch] font-semibold text-3xl tracking-tight">
						Four surfaces, one compiled workspace.
					</h2>

					<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{SURFACES.map((surface, i) => (
							<Reveal key={surface.title} stagger={i * 0.05}>
								<Card className="h-full">
									<CardContent className="flex h-full flex-col gap-3">
										<span className="flex size-9 items-center justify-center rounded-full bg-sidebar-accent">
											<HugeiconsIcon icon={surface.icon} className="size-4" />
										</span>
										<p className="font-semibold text-lg tracking-tight">
											{surface.title}
										</p>
										<p className="text-muted-foreground leading-relaxed">
											{surface.body}
										</p>
									</CardContent>
								</Card>
							</Reveal>
						))}
					</div>
				</Reveal>

				{/* Social proof — explicitly placeholder. Three fictional
				    readers rather than zero credibility signal, but no company
				    logos: there are no real customers yet, and a logo implies a
				    named customer in a way a quote attributed to "A. Reader"
				    does not. */}
				<Reveal className="mx-auto max-w-6xl px-5 pb-20">
					<Eyebrow>What early readers say (placeholder)</Eyebrow>
					<h2 className="mt-2 font-semibold text-3xl tracking-tight">
						Not real yet — swap before launch.
					</h2>

					<div className="mt-8 grid gap-4 md:grid-cols-3">
						{TESTIMONIALS.map((t, i) => (
							<Reveal key={t.name} stagger={i * 0.05}>
								<Card className="h-full">
									<CardContent className="flex h-full flex-col gap-4">
										<p className="text-muted-foreground leading-relaxed">
											“{t.quote}”
										</p>
										<div className="mt-auto flex items-center gap-3">
											<Avatar size="sm">
												<AvatarFallback>{t.name.slice(0, 1)}</AvatarFallback>
											</Avatar>
											<div>
												<p className="font-medium text-sm">{t.name}</p>
												<p className="text-muted-foreground text-xs">
													{t.role}
												</p>
											</div>
										</div>
									</CardContent>
								</Card>
							</Reveal>
						))}
					</div>
				</Reveal>

				{/* Closing CTA — pricing folded in as a single line rather than
				    a separate section, since there is nothing to compare yet. */}
				<Reveal className="mx-auto max-w-6xl px-5 pb-6">
					<div className="flex flex-wrap items-end justify-between gap-6 rounded-2xl bg-muted/40 px-8 py-10">
						<div>
							<Eyebrow>Free while in beta</Eyebrow>
							<p className="mt-2 max-w-[34ch] font-semibold text-3xl tracking-tight">
								Your first page compiles about a minute after your first save.
							</p>
						</div>
						<Link href="/register" className={buttonVariants({ size: "lg" })}>
							Start a workspace
						</Link>
					</div>
				</Reveal>

				<footer className="mx-auto flex max-w-6xl items-center justify-between px-5 py-8 text-muted-foreground text-sm">
					<span>© {new Date().getFullYear()} Traversa</span>
					<a
						href="https://github.com/halmahera-dev/knowledge-compiler"
						target="_blank"
						rel="noreferrer"
						className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
					>
						GitHub
					</a>
				</footer>
			</div>
		</div>
	);
}
