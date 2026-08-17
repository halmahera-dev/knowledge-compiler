"use client";

import {
	Asteroid02Icon,
	Cursor02Icon,
	HelpCircleIcon,
	IceCubesIcon,
	NotebookText,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@kc/ui/components/badge";
import { buttonVariants } from "@kc/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@kc/ui/components/card";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CompileArrow } from "@/features/marketing/compile-arrow";
import { LandingGraph } from "@/features/marketing/landing-graph";

const SURFACES: {
	icon: IconSvgElement;
	title: string;
	body: string;
}[] = [
	{
		icon: NotebookText,
		title: "Wiki",
		body: "Pages that write themselves, citing every claim.",
	},
	{
		icon: Cursor02Icon,
		title: "Ask",
		body: "Answered from what's compiled — cited inline.",
	},
	{
		icon: Asteroid02Icon,
		title: "Graph",
		body: "Typed connections, not just “related”.",
	},
	{
		icon: HelpCircleIcon,
		title: "Gaps",
		body: "What your reading assumes, but never covers.",
	},
];

const SOURCES: {
	kind: string;
	title: string;
	excerpt: string;
}[] = [
	{
		kind: "Paper",
		title: "National Sleep Foundation meta-analysis",
		excerpt:
			"Adults aged 18–64 who sleep 7 hours show lower all-cause mortality than those sleeping 6 or fewer, with diminishing returns beyond 8.",
	},
	{
		kind: "Note",
		title: "My sleep tracking experiment",
		excerpt:
			'After three months of tracking, I feel best at 6.5 hours. The "8 hours" rule left me groggy and slow to start.',
	},
	{
		kind: "PDF",
		title: "Chronotype and cognitive performance",
		excerpt:
			"Late chronotypes forced into early schedules lose 12–15% on working memory tasks, independent of total sleep duration.",
	},
];

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
		<div className="min-h-svh bg-background">
			<header className="sticky top-0 z-20 border-border/50 border-b bg-background/70 backdrop-blur-md">
				<div className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-4">
					<div className="flex items-center gap-2">
						<HugeiconsIcon icon={IceCubesIcon} className="size-4" />
						<span className="font-medium text-sm">Traversa</span>
					</div>
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

			{/* Hero — headline, pitch, CTA. No product screenshot underneath any
			    more: the compile-demo section right below carries that job now,
			    as a plain section rather than a framed widget. */}
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
						<Link href="/register" className={buttonVariants({ size: "lg" })}>
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

			{/* Compile demo — a static before/after instead of the old 3-stage
			    toggle: three sources, an animated arrow showing them converge,
			    then the compiled page. The topic is sleep research rather than
			    LLM quantisation — a visitor should read the disagreement in two
			    seconds without domain expertise, which is the whole point of
			    showing this instead of just claiming it in a bullet point. */}
			<Reveal className="mx-auto max-w-6xl px-5 pt-16 pb-16">
				<Eyebrow>One topic, three sources</Eyebrow>
				<h2 className="mt-2 font-semibold text-3xl tracking-tight">
					Multiple sources, one wiki page.
				</h2>
				<p className="mt-3 max-w-[58ch] text-muted-foreground text-sm leading-relaxed">
					Save sources. An agent reads them once. You get a wiki page that cites
					everything — and keeps contradictions instead of picking a winner.
				</p>

				{/* Staggered so the compile reads as a sequence — sources, then the
            arrow, then the result — instead of arriving as one flat fade.
            Reuses this file's own `Reveal`/`stagger` vocabulary rather than
            inventing a new one. */}
				<div className="mt-8 grid gap-3 sm:grid-cols-3">
					{SOURCES.map((source, i) => (
						<Reveal key={source.title} stagger={i * 0.04}>
							<Card
								size="sm"
								className="h-full transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-lg"
							>
								<CardContent className="flex flex-col gap-2">
									<p className="flex items-center gap-2">
										<Badge variant="secondary">{source.kind}</Badge>
										<span className="truncate font-medium">{source.title}</span>
									</p>
									<p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
										{source.excerpt}
									</p>
								</CardContent>
							</Card>
						</Reveal>
					))}
				</div>

				<Reveal stagger={0.15}>
					<CompileArrow />
				</Reveal>

				<Reveal stagger={0.3}>
					<Card>
						<CardHeader>
							<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
								Wiki page
							</p>
							<CardTitle className="font-semibold text-xl">
								How much sleep is enough
							</CardTitle>
						</CardHeader>

						<CardContent>
							<section className="mt-5 first:mt-0">
								<h3 className="mb-1 font-semibold text-base">
									What the research says
								</h3>
								<ul className="divide-y divide-border">
									<li className="-mx-2 rounded-xl px-2 py-3">
										<p>
											Adults sleeping 7+ hours show lower mortality than those
											sleeping 6 or fewer.
										</p>
										<blockquote className="mt-2 border-border border-l-2 pl-3 text-muted-foreground italic leading-relaxed">
											"Adults aged 18–64 who sleep 7 hours show lower all-cause
											mortality"
										</blockquote>
										<p className="mt-1 pl-3 text-muted-foreground text-xs">
											National Sleep Foundation meta-analysis
										</p>
									</li>
								</ul>
							</section>

							<section className="mt-5">
								<h3 className="mb-1 font-semibold text-base">
									What varies by person
								</h3>
								<ul className="divide-y divide-border">
									<li className="-mx-2 rounded-xl px-2 py-3">
										<p className="flex items-start gap-2">
											<span className="min-w-0 flex-1">
												6.5 hours of sleep can outperform 8, depending on
												chronotype and sleep quality.
											</span>
											<Badge variant="destructive">disputed</Badge>
										</p>
										<blockquote className="mt-2 border-border border-l-2 pl-3 text-muted-foreground italic leading-relaxed">
											"I feel best at 6.5 hours. The '8 hours' rule left me
											groggy."
										</blockquote>
										<p className="mt-1 pl-3 text-muted-foreground text-xs">
											My sleep tracking experiment
										</p>
									</li>
									<li className="-mx-2 rounded-xl px-2 py-3">
										<p className="flex items-start gap-2">
											<span className="min-w-0 flex-1">
												Late chronotypes forced into early schedules lose 12–15%
												on working memory, regardless of total hours.
											</span>
											<Badge variant="destructive">disputed</Badge>
										</p>
										<blockquote className="mt-2 border-border border-l-2 pl-3 text-muted-foreground italic leading-relaxed">
											"Late chronotypes forced into early schedules lose 12–15%
											on working memory tasks"
										</blockquote>
										<p className="mt-1 pl-3 text-muted-foreground text-xs">
											Chronotype and cognitive performance
										</p>
									</li>
								</ul>
							</section>
						</CardContent>
					</Card>

					<p className="mt-4 max-w-[52ch] text-muted-foreground text-sm leading-relaxed">
						The research and the personal experiment contradict each other.
						Nothing here decides which is right — both are on the page, marked,
						with the passage each came from.
					</p>
				</Reveal>
			</Reveal>

			{/* Graph — the actual `GraphViewer` component the product uses,
			    fed mock data on the same sleep topic. A real visual, not a
			    diagram drawn to look like one. */}
			<Reveal className="mx-auto max-w-6xl px-5 pb-16">
				<div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
					<div className="lg:col-span-4">
						<Eyebrow>See what it knows</Eyebrow>
						<h2 className="mt-2 font-semibold text-3xl tracking-tight">
							Topics link themselves.
						</h2>
						<p className="mt-4 text-muted-foreground text-sm leading-relaxed">
							A force-directed graph of every topic in your workspace. Related
							concepts cluster together. Contradictions show as edges you can
							trace back to the source. No filing, no tagging — the shape
							emerges from what you saved.
						</p>
					</div>

					<div className="lg:col-span-8 lg:col-start-5">
						<Card className="overflow-hidden">
							<CardContent className="p-0">
								<LandingGraph />
							</CardContent>
						</Card>
					</div>
				</div>
			</Reveal>

			<div className="flex flex-col gap-28 py-16">
				<Reveal className="mx-auto max-w-6xl px-5">
					<Eyebrow>Everywhere in the app</Eyebrow>
					<h2 className="mt-2 max-w-[26ch] font-semibold text-3xl tracking-tight">
						Four surfaces, one compiled workspace.
					</h2>

					<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{SURFACES.map((surface, i) => (
							<Reveal key={surface.title} stagger={i * 0.05}>
								<Card className="h-full transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-lg">
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

				<div className="mx-auto w-full max-w-[80rem]">
					<Reveal className="mx-4 sm:mx-8">
						<div className="relative isolate flex min-h-80 flex-col items-center justify-center overflow-hidden rounded-3xl px-8 py-16 text-center">
							<Image
								src="/magic.webp"
								alt=""
								fill
								sizes="100vw"
								className="-z-10 object-cover object-center brightness-[0.55]"
							/>
							<div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />

							<p className="font-medium text-white/70 text-xs uppercase tracking-wider">
								Free while in beta
							</p>
							<p className="mt-3 font-semibold text-4xl text-white tracking-tight">
								Start compiling.
							</p>
							<p className="mx-auto mt-3 max-w-[38ch] text-sm text-white/80 leading-relaxed">
								Your first page is ready about a minute after your first save.
							</p>
							<div className="mt-6">
								<Link
									href="/register"
									className={buttonVariants({ size: "lg" })}
								>
									Start a workspace
								</Link>
							</div>
						</div>
					</Reveal>
				</div>
			</div>

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
	);
}
