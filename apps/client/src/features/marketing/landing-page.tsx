import { IceCubesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@kc/ui/components/badge";
import { buttonVariants } from "@kc/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@kc/ui/components/card";
import Link from "next/link";
import type { ReactNode } from "react";
import { CompileArrow } from "@/features/marketing/compile-arrow";
import { LandingGraph } from "@/features/marketing/landing-graph";

/**
 * The landing page.
 *
 * Six sections, readable in under 15 seconds of scrolling:
 * 1. Hero — what it is, one CTA
 * 2. Compile demo — static before/after showing the core claim
 * 3. Graph — the visual "wow" moment
 * 4. Workspaces — one account, many isolated spaces
 * 5. Copilot — cited answers, kept short
 * 6. Final CTA — close the deal
 */

function Eyebrow({ children }: { children: ReactNode }) {
	return (
		<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
			{children}
		</p>
	);
}

function SupCite({ n }: { n: number }) {
	return (
		<sup className="ml-0.5">
			<span className="sr-only">citation {n}</span>
			<span
				aria-hidden="true"
				className="font-mono text-muted-foreground text-xs"
			>
				[{n}]
			</span>
		</sup>
	);
}

export function LandingPage() {
	return (
		<div className="min-h-svh bg-sidebar">
			<div className="m-2 overflow-hidden rounded-2xl border bg-background shadow-sm">
				{/* ── Masthead ── */}
				<div className="notes-canvas">
					<header className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-4">
						<HugeiconsIcon icon={IceCubesIcon} className="size-4" />
						<span className="font-medium text-sm">Traversa</span>
						<Link
							href="/login"
							className="ml-auto text-muted-foreground text-sm underline-offset-4 transition-colors hover:text-foreground hover:underline"
						>
							Sign in
						</Link>
					</header>

					{/* ── 1. Hero ── */}
					<section className="mx-auto max-w-6xl px-5 pt-10 pb-16">
						<Eyebrow>Personal knowledge base</Eyebrow>

						<h1 className="mt-3 max-w-[28ch] font-semibold text-4xl tracking-tight sm:text-5xl">
							Read it once.
							<br />
							It stays read.
						</h1>

						<p className="mt-4 max-w-[52ch] text-lg text-muted-foreground leading-relaxed">
							Save a link, a passage, or a PDF. An agent reads it once, writes
							down what it claims, and folds that into a wiki that already knows
							what you saved before.
						</p>

						<div className="mt-8 flex flex-wrap items-center gap-4">
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
					</section>
				</div>

				{/* ── 2. Compile demo: vertical pipeline ── */}
				<section
					aria-labelledby="compile-heading"
					className="mx-auto max-w-6xl px-5 pt-16 pb-16"
				>
					<Eyebrow>One topic, three sources</Eyebrow>
					<h2
						id="compile-heading"
						className="mt-2 font-semibold text-3xl tracking-tight"
					>
						Multiple sources, one wiki page.
					</h2>
					<p className="mt-3 max-w-[58ch] text-muted-foreground text-sm leading-relaxed">
						Save sources. An agent reads them once. You get a wiki page that
						cites everything — and keeps contradictions instead of picking a
						winner.
					</p>

					{/* Sources — horizontal row */}
					<div className="mt-8 grid gap-3 sm:grid-cols-3">
						<Card size="sm">
							<CardContent className="flex flex-col gap-2">
								<p className="flex items-center gap-2">
									<Badge variant="secondary">Paper</Badge>
									<span className="truncate font-medium">
										National Sleep Foundation meta-analysis
									</span>
								</p>
								<p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
									Adults aged 18–64 who sleep 7 hours show lower all-cause
									mortality than those sleeping 6 or fewer, with diminishing
									returns beyond 8.
								</p>
							</CardContent>
						</Card>

						<Card size="sm">
							<CardContent className="flex flex-col gap-2">
								<p className="flex items-center gap-2">
									<Badge variant="secondary">Note</Badge>
									<span className="truncate font-medium">
										My sleep tracking experiment
									</span>
								</p>
								<p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
									After three months of tracking, I feel best at 6.5 hours.
									The "8 hours" rule left me groggy and slow to start.
								</p>
							</CardContent>
						</Card>

						<Card size="sm">
							<CardContent className="flex flex-col gap-2">
								<p className="flex items-center gap-2">
									<Badge variant="secondary">PDF</Badge>
									<span className="truncate font-medium">
										Chronotype and cognitive performance
									</span>
								</p>
								<p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
									Late chronotypes forced into early schedules lose 12–15% on
									working memory tasks, independent of total sleep duration.
								</p>
							</CardContent>
						</Card>
					</div>

					<CompileArrow />

					{/* Compiled wiki page */}
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
										<p>Adults sleeping 7+ hours show lower mortality than those sleeping 6 or fewer.</p>
										<blockquote className="mt-2 border-border border-l-2 pl-3 text-muted-foreground italic leading-relaxed">
											"Adults aged 18–64 who sleep 7 hours show lower
											all-cause mortality"
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
												6.5 hours of sleep can outperform 8, depending
												on chronotype and sleep quality.
											</span>
											<Badge variant="destructive">disputed</Badge>
										</p>
										<blockquote className="mt-2 border-border border-l-2 pl-3 text-muted-foreground italic leading-relaxed">
											"I feel best at 6.5 hours. The '8 hours' rule left
											me groggy."
										</blockquote>
										<p className="mt-1 pl-3 text-muted-foreground text-xs">
											My sleep tracking experiment
										</p>
									</li>
									<li className="-mx-2 rounded-xl px-2 py-3">
										<p className="flex items-start gap-2">
											<span className="min-w-0 flex-1">
												Late chronotypes forced into early schedules lose
												12–15% on working memory, regardless of total
												hours.
											</span>
											<Badge variant="destructive">disputed</Badge>
										</p>
										<blockquote className="mt-2 border-border border-l-2 pl-3 text-muted-foreground italic leading-relaxed">
											"Late chronotypes forced into early schedules lose
											12–15% on working memory tasks"
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
						Nothing here decides which is right — both are on the page,
						marked, with the passage each came from.
					</p>
				</section>

				{/* ── 3. Graph visualization ── */}
				<section
					aria-labelledby="graph-heading"
					className="mx-auto max-w-6xl px-5 pb-16"
				>
					<div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
						<div className="lg:col-span-4">
							<Eyebrow>See what it knows</Eyebrow>
							<h2
								id="graph-heading"
								className="mt-2 font-semibold text-3xl tracking-tight"
							>
								Topics link themselves.
							</h2>
							<p className="mt-4 text-muted-foreground text-sm leading-relaxed">
								A force-directed graph of every topic in your workspace.
							 Related concepts cluster together. Contradictions show as
								edges you can trace back to the source. No filing, no tagging
								— the shape emerges from what you saved.
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
				</section>

				{/* ── 4. Workspaces ── */}
				<section
					aria-labelledby="shape-heading"
					className="mx-auto max-w-6xl px-5 pb-16"
				>
					<Eyebrow>How it is arranged</Eyebrow>
					<h2
						id="shape-heading"
						className="mt-2 max-w-[24ch] font-semibold text-3xl tracking-tight"
					>
						One account, as many workspaces as you keep subjects.
					</h2>

					<Card className="mt-8 max-w-3xl">
						<CardContent className="flex flex-col gap-4">
							<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
								Your account
							</p>

							<div className="flex flex-col gap-3">
								<Card size="sm" className="bg-muted/40 shadow-none">
									<CardContent>
										<p className="flex flex-wrap items-baseline gap-x-3">
											<span className="font-medium">Thesis</span>
											<span className="text-muted-foreground text-xs tabular-nums">
												41 captures · 12 pages
											</span>
										</p>
										<p className="mt-1 text-muted-foreground">
											Its own wiki, graph, gaps and conversations.
										</p>
									</CardContent>
								</Card>
								<Card size="sm" className="bg-muted/40 shadow-none">
									<CardContent>
										<p className="flex flex-wrap items-baseline gap-x-3">
											<span className="font-medium">Work reading</span>
											<span className="text-muted-foreground text-xs tabular-nums">
												18 captures · 6 pages
											</span>
										</p>
										<p className="mt-1 text-muted-foreground">
											Its own wiki, graph, gaps and conversations.
										</p>
									</CardContent>
								</Card>
							</div>

							<p className="text-muted-foreground leading-relaxed">
								Nothing crosses between them. A question asked in one is
								answered only from what that one has read.
							</p>
						</CardContent>
					</Card>
				</section>

				{/* ── 5. Copilot ── */}
				<section
					aria-labelledby="ask-heading"
					className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 lg:grid-cols-12 lg:gap-8"
				>
					<div className="lg:col-span-4">
						<Eyebrow>And then ask it</Eyebrow>
						<h2
							id="ask-heading"
							className="mt-2 font-semibold text-3xl tracking-tight"
						>
							Answers you can check.
						</h2>
						<p className="mt-4 text-muted-foreground text-sm leading-relaxed">
							Answered only from what this workspace compiled, each sentence
							carrying the claim it rests on.
						</p>
					</div>

					<div className="lg:col-span-7 lg:col-start-6">
						<Card>
							<CardContent>
								<p className="font-semibold text-xl">
									How much sleep do I actually need?
								</p>
								<p className="mt-3 leading-relaxed">
									Research points to 7 hours as the general threshold for
									adults<SupCite n={1} />, but individual chronotype and sleep
									quality can shift that number — one contributor found they
									performed better at 6.5 hours after months of
									tracking<SupCite n={2} />.
								</p>

								<ul className="mt-4 divide-y divide-border">
									<li className="flex gap-2 py-2 last:pb-0">
										<span className="font-mono text-muted-foreground text-xs">
											[1]
										</span>
										<span className="min-w-0">
											<span className="text-muted-foreground italic">
												"Adults aged 18–64 who sleep 7 hours show lower
												all-cause mortality"
											</span>
											<span className="ml-2 text-muted-foreground text-xs">
												National Sleep Foundation meta-analysis
											</span>
										</span>
									</li>
									<li className="flex gap-2 py-2 last:pb-0">
										<span className="font-mono text-muted-foreground text-xs">
											[2]
										</span>
										<span className="min-w-0">
											<span className="text-muted-foreground italic">
												"I feel best at 6.5 hours"
											</span>
											<span className="ml-2 text-muted-foreground text-xs">
												My sleep tracking experiment
											</span>
										</span>
									</li>
								</ul>
							</CardContent>
						</Card>
					</div>
				</section>

				{/* ── 6. Final CTA ── */}
				<section className="mx-auto max-w-6xl px-5 pb-6">
					<div className="flex flex-wrap items-end justify-between gap-6 rounded-2xl bg-muted/40 px-8 py-10">
						<div>
							<Eyebrow>Nothing to configure</Eyebrow>
							<p className="mt-2 max-w-[34ch] font-semibold text-3xl tracking-tight">
								Your first page compiles about a minute after your first save.
							</p>
						</div>
						<Link href="/register" className={buttonVariants({ size: "lg" })}>
							Start a workspace
						</Link>
					</div>
				</section>
			</div>
		</div>
	);
}
