"use client";

import { Badge } from "@kc/ui/components/badge";
import { Button } from "@kc/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@kc/ui/components/card";
import { cn } from "@kc/ui/lib/utils";
import { useState } from "react";

/**
 * The landing page's centrepiece: the compile, run on real-looking material.
 *
 * A feature list would have to assert that the product reads once and writes a
 * cited wiki. This shows it instead — three sources go in, claims come out, two
 * of them disagree and the page says so rather than picking a winner. That last
 * part is the whole argument against a summariser, and it cannot be made in a
 * bullet point.
 *
 * The compiled panel is drawn in the same components as the real thing
 * (`features/wiki/components/wiki-page-view.tsx`): a Card, section headings in
 * the same weight, claims as a `divide-y` list, disputes carried by the same
 * destructive Badge. Someone who signs up should meet this object again on
 * their first compiled page — a mock in a different visual language would be
 * advertising a product that does not exist.
 *
 * Hovering a claim marks the source it came from, and hovering a source marks
 * its claims. Provenance is the product, so it is the interaction — and the
 * mark is the same pale indigo the sidebar paints behind the active page.
 */

interface Source {
	id: string;
	kind: string;
	title: string;
	excerpt: string;
}

interface Claim {
	id: string;
	sourceId: string;
	section: string;
	text: string;
	quote: string;
	/** Set on both halves of a pair the compiler could not reconcile. */
	disputed?: boolean;
}

const SOURCES: Source[] = [
	{
		id: "s1",
		kind: "Paper",
		title: "LLM.int8(): 8-bit matrix multiplication",
		excerpt:
			"We find that a small number of feature dimensions — fewer than 0.1% of channels — carry activation magnitudes up to 20× the median, and that quantising these uniformly is what destroys accuracy at scale.",
	},
	{
		id: "s2",
		kind: "Note",
		title: "Quantisation, in practice",
		excerpt:
			"For anything above 7B, 4-bit weight-only quantisation is effectively free. I have run it across a dozen models and never seen a benchmark move more than a point.",
	},
	{
		id: "s3",
		kind: "PDF",
		title: "Reasoning under 4-bit weights",
		excerpt:
			"Aggregate benchmarks conceal the cost. On multi-step arithmetic and chain-of-thought tasks, 4-bit models lose 9–14 points, while single-hop retrieval is unchanged.",
	},
];

const CLAIMS: Claim[] = [
	{
		id: "c1",
		sourceId: "s1",
		section: "Where the error comes from",
		text: "Fewer than 0.1% of channels carry outlier activations, up to 20× the median.",
		quote:
			"fewer than 0.1% of channels — carry activation magnitudes up to 20× the median",
	},
	{
		id: "c2",
		sourceId: "s1",
		section: "Where the error comes from",
		text: "Quantising those outlier channels uniformly is the dominant source of accuracy loss.",
		quote: "quantising these uniformly is what destroys accuracy at scale",
	},
	{
		id: "c3",
		sourceId: "s2",
		section: "How far it can be pushed",
		text: "4-bit weight-only quantisation is near-lossless above 7B parameters.",
		quote: "4-bit weight-only quantisation is effectively free",
		disputed: true,
	},
	{
		id: "c4",
		sourceId: "s3",
		section: "How far it can be pushed",
		text: "4-bit costs 9–14 points on multi-step reasoning, which aggregate benchmarks hide.",
		quote:
			"4-bit models lose 9–14 points, while single-hop retrieval is unchanged",
		disputed: true,
	},
];

const STAGES = [
	{ id: 0, label: "Captured", note: "Three things you saved this week." },
	{
		id: 1,
		label: "Extracted",
		note: "Each read once. Claims lifted out, with the quote behind them.",
	},
	{
		id: 2,
		label: "Compiled",
		note: "Merged into one page. Where they disagree, both stay.",
	},
] as const;

const SECTIONS = [...new Set(CLAIMS.map((claim) => claim.section))];

export function CompileDemo() {
	const [stage, setStage] = useState(2);
	// Which source is under the reader's attention, from either column.
	const [marked, setMarked] = useState<string | null>(null);

	return (
		<section
			aria-labelledby="demo-heading"
			className="mx-auto max-w-6xl px-5"
			// One handler for the whole demo rather than one per card: leaving any
			// card by any route — including the pointer leaving the section entirely
			// — has to clear the mark, or a stale dimming survives the mouse.
			onMouseLeave={() => setMarked(null)}
		>
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
						One topic, three sources
					</p>
					<h2
						id="demo-heading"
						className="mt-2 font-semibold text-3xl tracking-tight"
					>
						What compiling actually does
					</h2>
				</div>

				{/* Stage control. Defaults to the finished page — the payoff first,
				    with the working shown to anyone who wants to check it.

				    Pressed buttons rather than a tablist: a real tablist owes the
				    reader roving tabindex and arrow-key navigation, and there is no
				    tabs primitive in this app to inherit that from. */}
				<fieldset className="flex flex-wrap gap-1.5">
					<legend className="sr-only">Compile stage</legend>
					{STAGES.map((s) => (
						<Button
							key={s.id}
							size="sm"
							variant={stage === s.id ? "default" : "outline"}
							aria-pressed={stage === s.id}
							className="rounded-full"
							onClick={() => setStage(s.id)}
						>
							{s.label}
						</Button>
					))}
				</fieldset>
			</div>

			<p className="mt-3 max-w-[58ch] text-muted-foreground text-sm leading-relaxed">
				{STAGES[stage]?.note}
			</p>

			<div className="mt-8 grid gap-6 lg:grid-cols-12">
				{/* The sources, at the smaller card size. Depth here comes from scale
				    and elevation rather than from one panel overlapping another —
				    nothing in the app overlaps anything. */}
				<div className="flex flex-col gap-3 lg:col-span-5">
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Saved
					</p>

					{SOURCES.map((source) => {
						const isMarked = marked === source.id;
						return (
							<Card
								key={source.id}
								size="sm"
								onMouseEnter={() => setMarked(source.id)}
								className={cn(
									"transition-all duration-200",
									isMarked && "ring-2 ring-sidebar-accent",
									marked && !isMarked && "opacity-60",
								)}
							>
								<CardContent className="flex flex-col gap-2">
									<p className="flex items-center gap-2">
										<Badge variant="secondary">{source.kind}</Badge>
										<span className="truncate font-medium">{source.title}</span>
									</p>

									{/* Full text while it is the only thing on screen; clamped
									    once the claims below it are the point. Clamped by CSS so
									    the cut lands on a line, not mid-word. */}
									<p
										className={cn(
											"text-muted-foreground leading-relaxed",
											stage > 0 && "line-clamp-2",
										)}
									>
										{source.excerpt}
									</p>

									{/* From stage 1 the claims lifted from this source appear
									    under it, so extraction is visibly per-source. */}
									{stage >= 1 ? (
										<ul className="divide-y divide-border">
											{CLAIMS.filter(
												(claim) => claim.sourceId === source.id,
											).map((claim) => (
												<li
													key={claim.id}
													className="py-2 text-muted-foreground text-xs leading-relaxed first:pt-0 last:pb-0"
												>
													{claim.text}
												</li>
											))}
										</ul>
									) : null}
								</CardContent>
							</Card>
						);
					})}
				</div>

				<div className="lg:col-span-7">
					<Card>
						<CardHeader>
							<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
								Wiki page
							</p>
							<CardTitle className="font-semibold text-xl">
								Post-training quantisation
							</CardTitle>
						</CardHeader>

						<CardContent>
							{stage < 2 ? (
								<p className="py-10 text-center text-muted-foreground">
									{stage === 0 ? "Nothing compiled yet." : "Merging…"}
								</p>
							) : (
								SECTIONS.map((section) => (
									<section key={section} className="mt-5 first:mt-0">
										<h3 className="mb-1 font-semibold text-base">{section}</h3>
										<ul className="divide-y divide-border">
											{CLAIMS.filter((claim) => claim.section === section).map(
												(claim) => {
													const isMarked = marked === claim.sourceId;
													return (
														<li
															key={claim.id}
															onMouseEnter={() => setMarked(claim.sourceId)}
															className={cn(
																"-mx-2 rounded-xl px-2 py-3 transition-colors duration-200",
																isMarked && "bg-sidebar-accent",
																marked && !isMarked && "opacity-60",
															)}
														>
															<p className="flex items-start gap-2">
																<span className="min-w-0 flex-1">
																	{claim.text}
																</span>
																{claim.disputed ? (
																	<Badge variant="destructive">disputed</Badge>
																) : null}
															</p>

															{/* The quote is the check. Always present, not
															    revealed on demand, because a citation you have
															    to go looking for does not get looked at. */}
															<blockquote className="mt-2 border-border border-l-2 pl-3 text-muted-foreground italic leading-relaxed">
																“{claim.quote}”
															</blockquote>
															<p className="mt-1 pl-3 text-muted-foreground text-xs">
																{
																	SOURCES.find(
																		(source) => source.id === claim.sourceId,
																	)?.title
																}
															</p>
														</li>
													);
												},
											)}
										</ul>
									</section>
								))
							)}
						</CardContent>
					</Card>

					{stage === 2 ? (
						<p className="mt-4 max-w-[52ch] text-muted-foreground text-sm leading-relaxed">
							The note and the PDF contradict each other. Nothing here decides
							which is right — both are on the page, marked, with the passage
							each came from.
						</p>
					) : null}
				</div>
			</div>
		</section>
	);
}
