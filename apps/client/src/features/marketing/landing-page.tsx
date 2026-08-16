import { IceCubesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { buttonVariants } from "@kc/ui/components/button";
import { Card, CardContent } from "@kc/ui/components/card";
import Link from "next/link";
import type { ReactNode } from "react";
import { CompileDemo } from "@/features/marketing/compile-demo";

/**
 * The landing page.
 *
 * Wears the app's own clothes, deliberately: the page is the same floating
 * inset panel the signed-in shell is (`SidebarInset` — `m-2 rounded-2xl border
 * bg-background`), every surface on it is a real `Card`, and the compile demo
 * is drawn in the same components as the compiled page it is advertising. The
 * transition from here to `/agent` should read as a change of content inside
 * a frame that never moves, because someone who signs up ought to recognise the
 * app they arrive in.
 *
 * What it is not is a hero with three feature cards. The argument is carried by
 * {@link CompileDemo} — three real sources going in, a cited page with a live
 * disagreement coming out — because the claim that separates this from a
 * summariser is one a feature list cannot make.
 */

/** The three things it deliberately is not. Positioning, stated as refusals. */
const REFUSALS = [
	{
		not: "Not a search box",
		// Sharpened because the page also demonstrates asking questions: the claim
		// is about when the reading happens, not about whether you may ask.
		body: "You can ask it things. It answers from what it already compiled, rather than re-reading your library at question time.",
	},
	{
		not: "Not a folder",
		body: "Nothing to file, tag or tidy. Pages find their own place and link themselves.",
	},
	{
		not: "Not a summariser",
		body: "Every sentence carries the passage it came from. When two sources disagree the page keeps both — deciding for you is how a summary becomes a rumour.",
	},
] as const;

const COMMITMENTS = [
	["Compiles on save", "Not on every question."],
	["Cites every sentence", "The passage, not just the link."],
	["Keeps contradictions", "Marked, never quietly merged."],
] as const;

const WORKSPACES = [
	["Thesis", "41 captures · 12 pages"],
	["Work reading", "18 captures · 6 pages"],
] as const;

const ANSWER_SOURCES = [
	[
		"1",
		"LLM.int8()",
		"quantising these uniformly is what destroys accuracy at scale",
	],
	["2", "Reasoning under 4-bit weights", "4-bit models lose 9–14 points"],
] as const;

/**
 * A citation marker inside prose.
 *
 * Marked `aria-hidden` and paired with a visually-hidden label, so a screen
 * reader hears "citation 1" rather than the bare digit running into the
 * sentence before it. Muted rather than indigo, matching how the copilot
 * renders the same marker in `features/agent/citation-markdown.tsx`.
 */
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

function Eyebrow({ children }: { children: ReactNode }) {
	return (
		<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
			{children}
		</p>
	);
}

export function LandingPage() {
	return (
		<div className="min-h-svh bg-sidebar">
			<div className="m-2 overflow-hidden rounded-2xl border bg-background shadow-sm">
				{/* The masthead sits on the app's own indigo wash (`.notes-canvas`),
				    which is the codebase's sanctioned way of using the accent as
				    atmosphere rather than as decoration. */}
				<div className="notes-canvas">
					{/* Not the app header: no nav to pages you cannot reach yet. */}
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

					{/* Asymmetric on purpose — a centred headline with a button under it
					    is the one arrangement every landing page already has. */}
					<section className="mx-auto grid max-w-6xl gap-10 px-5 pt-10 pb-16 lg:grid-cols-12 lg:gap-8">
						<div className="lg:col-span-7">
							<Eyebrow>Personal knowledge base</Eyebrow>

							<h1 className="mt-3 font-semibold text-4xl tracking-tight sm:text-5xl">
								Read it once.
								<br />
								It stays read.
							</h1>

							<p className="mt-4 max-w-[52ch] text-lg text-muted-foreground leading-relaxed">
								Save a link, a passage, or a PDF. An agent reads it, writes down
								what it claims, and folds that into a wiki that already knows
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
						</div>

						{/* The three commitments, as one small surface rather than three
						    competing ones. */}
						<aside className="lg:col-span-4 lg:col-start-9">
							<Card size="sm">
								<CardContent>
									<dl className="divide-y divide-border">
										{COMMITMENTS.map(([term, detail]) => (
											<div key={term} className="py-3 first:pt-0 last:pb-0">
												<dt className="font-medium">{term}</dt>
												<dd className="mt-0.5 text-muted-foreground">
													{detail}
												</dd>
											</div>
										))}
									</dl>
								</CardContent>
							</Card>
						</aside>
					</section>
				</div>

				<div className="py-16">
					<CompileDemo />
				</div>

				{/* The copilot, shown as one exchange rather than described. Its whole
				    claim is that answers are checkable, which is a thing you can only
				    judge by seeing an answer next to the passage behind it. */}
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
							carrying the claim it rests on. Conversations are saved, so you
							can pick one up later.
						</p>
					</div>

					<div className="lg:col-span-7 lg:col-start-6">
						<Card>
							<CardContent>
								<p className="font-semibold text-xl">
									Why does quantisation hurt accuracy unevenly?
								</p>
								<p className="mt-3 leading-relaxed">
									A small number of channels carry outlier activations, and
									quantising them uniformly is what dominates the error
									<SupCite n={1} /> — which is why aggregate benchmarks can look
									flat while multi-step reasoning drops
									<SupCite n={2} />.
								</p>

								<ul className="mt-4 divide-y divide-border">
									{ANSWER_SOURCES.map(([n, source, quote]) => (
										<li key={n} className="flex gap-2 py-2 last:pb-0">
											<span className="font-mono text-muted-foreground text-xs">
												[{n}]
											</span>
											<span className="min-w-0">
												<span className="text-muted-foreground italic">
													“{quote}”
												</span>
												<span className="ml-2 text-muted-foreground text-xs">
													{source}
												</span>
											</span>
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					</div>
				</section>

				{/* How the thing is shaped. Stated plainly because it is the part
				    people get wrong on arrival: they assume one account means one
				    pile. Rendered as nesting rather than as three bullets, so the
				    containment is visible instead of asserted. */}
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
								{WORKSPACES.map(([name, contents]) => (
									<Card
										key={name}
										size="sm"
										className="bg-muted/40 shadow-none"
									>
										<CardContent>
											<p className="flex flex-wrap items-baseline gap-x-3">
												<span className="font-medium">{name}</span>
												<span className="text-muted-foreground text-xs tabular-nums">
													{contents}
												</span>
											</p>
											<p className="mt-1 text-muted-foreground">
												Its own wiki, graph, gaps and conversations.
											</p>
										</CardContent>
									</Card>
								))}
							</div>

							<p className="text-muted-foreground leading-relaxed">
								Nothing crosses between them. A question asked in one is
								answered only from what that one has read.
							</p>
						</CardContent>
					</Card>
				</section>

				{/* Positioning. One object with an internal argument rather than three
				    cards competing for the same glance. */}
				<section
					aria-labelledby="refusals-heading"
					className="mx-auto max-w-6xl px-5 pb-16"
				>
					<h2 id="refusals-heading" className="sr-only">
						What it is not
					</h2>
					<Card>
						<CardContent className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
							{REFUSALS.map(({ not, body }) => (
								<div
									key={not}
									className="py-4 first:pt-0 last:pb-0 md:px-6 md:py-0 md:last:pr-0 md:first:pl-0"
								>
									<p className="font-semibold text-xl tracking-tight">{not}</p>
									<p className="mt-2 text-muted-foreground leading-relaxed">
										{body}
									</p>
								</div>
							))}
						</CardContent>
					</Card>
				</section>

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

				{/* The footer held one line restating the page above it. The call to
				    action is the last thing worth reading here. */}
			</div>
		</div>
	);
}
