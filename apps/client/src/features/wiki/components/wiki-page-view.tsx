"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@kc/ui/components/accordion";
import { Badge } from "@kc/ui/components/badge";
import { Button, buttonVariants } from "@kc/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@kc/ui/components/card";
import { Empty, EmptyDescription, EmptyTitle } from "@kc/ui/components/empty";
import { Separator } from "@kc/ui/components/separator";
import { Skeleton } from "@kc/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import type { Claim } from "@/features/wiki/wiki-api";
import { revertPage } from "@/features/wiki/wiki-api";
import { wikiKeys } from "@/features/wiki/wiki-cache";
import { pageQueryOptions } from "@/features/wiki/wiki-query-options";
import { isSignedOut } from "@/lib/api-client";

/**
 * One compiled page, with the evidence under it.
 *
 * The claims are the point. Each carries the verbatim sentence that produced
 * it, which is what lets a reader check the page rather than trust it — so the
 * quote is never summarised away, and a disputed claim shows both sides rather
 * than picking one.
 */

function ClaimRow({ claim }: { claim: Claim }) {
	return (
		<li className="py-3">
			<p className="flex items-start gap-2">
				<span className="min-w-0 flex-1">{claim.text}</span>
				{claim.status !== "asserted" ? (
					<Badge
						variant={claim.status === "disputed" ? "destructive" : "secondary"}
					>
						{claim.status}
					</Badge>
				) : null}
			</p>

			{claim.sources.length > 0 ? (
				<ul className="mt-2 flex flex-col gap-2 border-border border-l-2 pl-3">
					{claim.sources.map((source, i) => (
						<li key={`${claim.id}-${i}`} className="text-sm">
							<span
								className={
									source.stance === "contradicts"
										? "text-destructive text-xs uppercase tracking-wide"
										: "text-muted-foreground text-xs uppercase tracking-wide"
								}
							>
								{source.stance}
							</span>
							<p className="text-muted-foreground italic leading-relaxed">
								“{source.quote}”
							</p>
							{source.sourceUrl ? (
								<a
									href={source.sourceUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs underline underline-offset-2"
								>
									{source.sourceTitle ?? source.sourceUrl}
								</a>
							) : source.sourceTitle ? (
								<span className="text-muted-foreground text-xs">
									{source.sourceTitle}
								</span>
							) : null}
						</li>
					))}
				</ul>
			) : null}
		</li>
	);
}

export function WikiPageView({ slug }: { slug: string }) {
	const page = useQuery(pageQueryOptions(slug));
	const queryClient = useQueryClient();

	const revert = useMutation({
		mutationFn: (revisionNo: number) => revertPage(page.data!.id, revisionNo),
		onSuccess: (updated) => {
			queryClient.invalidateQueries({ queryKey: wikiKeys.page(slug) });
			queryClient.invalidateQueries({ queryKey: wikiKeys.pages() });
			toast.success(`Rolled back to revision ${updated.revisionNo}.`);
		},
		onError: () => {
			toast.error("Could not roll that back.");
		},
	});

	if (page.isPending) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<PageHeader title="Wiki" />
				<div className="flex flex-col gap-3 px-4">
					<Skeleton className="h-10 w-2/3 rounded-lg" />
					<Skeleton className="h-40 rounded-xl" />
				</div>
			</div>
		);
	}

	if (page.isError) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<PageHeader title="Wiki" />
				<Empty>
					<EmptyTitle>
						{isSignedOut(page.error) ? "Sign in to see this" : "Page not found"}
					</EmptyTitle>
					<EmptyDescription>
						{isSignedOut(page.error)
							? "Pages belong to a workspace, so they need a session."
							: "It may have been rolled back or never compiled."}
					</EmptyDescription>
					<Link className={buttonVariants({ variant: "outline" })} href="/">
						Back to the wiki
					</Link>
				</Empty>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title="Wiki">
				<span className="ml-auto hidden font-mono text-muted-foreground text-xs md:block">
					revision {page.data.revisionNo} · updated{" "}
					{new Date(page.data.updatedAt).toLocaleDateString()}
				</span>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-12">
				<article className="mx-auto max-w-3xl">
					<h1 className="font-semibold text-3xl tracking-tight">
						{page.data.title}
					</h1>
					<p className="mt-2 text-lg text-muted-foreground leading-relaxed">
						{page.data.summary}
					</p>

					<Separator className="my-6" />

					{page.data.sections.map((section) => (
						<section key={section.heading} className="mb-6">
							<h2 className="mb-2 font-semibold text-xl">{section.heading}</h2>
							<div className="whitespace-pre-wrap leading-relaxed">
								{section.body}
							</div>
						</section>
					))}

					<Card className="mt-8">
						<CardHeader>
							<CardTitle className="text-base">
								Claims ({page.data.claims.length})
							</CardTitle>
						</CardHeader>
						<CardContent>
							{page.data.claims.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No claims recorded on this page yet.
								</p>
							) : (
								<ul className="divide-y divide-border">
									{page.data.claims.map((claim) => (
										<ClaimRow key={claim.id} claim={claim} />
									))}
								</ul>
							)}
						</CardContent>
					</Card>

					<Accordion className="mt-6">
						<AccordionItem value="sources">
							<AccordionTrigger>
								Sources ({page.data.sources.length})
							</AccordionTrigger>
							<AccordionContent>
								<ul className="flex flex-col gap-2">
									{page.data.sources.map((source) => (
										<li key={source.id} className="text-sm">
											{source.sourceUrl ? (
												<a
													href={source.sourceUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="underline underline-offset-2"
												>
													{source.title ?? source.sourceUrl}
												</a>
											) : (
												<span>{source.title ?? "Untitled"}</span>
											)}
											<span className="ml-2 text-muted-foreground text-xs">
												{source.captureType}
											</span>
										</li>
									))}
								</ul>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="revisions">
							<AccordionTrigger>
								History ({page.data.revisions.length})
							</AccordionTrigger>
							<AccordionContent>
								<ul className="flex flex-col gap-2">
									{page.data.revisions.map((revision) => (
										<li
											key={revision.id}
											className="flex items-center gap-3 text-sm"
										>
											<span className="font-mono tabular-nums">
												r{revision.revisionNo}
											</span>
											<span className="text-muted-foreground">
												{revision.action ?? "compile"}
											</span>
											<span className="text-muted-foreground text-xs">
												{new Date(revision.createdAt).toLocaleString()}
											</span>
											{revision.revisionNo < page.data.revisionNo ? (
												<Button
													variant="outline"
													size="sm"
													className="ml-auto"
													disabled={revert.isPending}
													onClick={() => revert.mutate(revision.revisionNo)}
												>
													Roll back to r{revision.revisionNo}
												</Button>
											) : (
												<Badge variant="secondary" className="ml-auto">
													current
												</Badge>
											)}
										</li>
									))}
								</ul>
							</AccordionContent>
						</AccordionItem>

						{page.data.backlinks.length > 0 ? (
							<AccordionItem value="backlinks">
								<AccordionTrigger>
									Linked from ({page.data.backlinks.length})
								</AccordionTrigger>
								<AccordionContent>
									<ul className="flex flex-col gap-2">
										{page.data.backlinks.map((page) => (
											<li key={page.id}>
												<Link
													href={`/${page.slug}`}
													className="text-sm underline underline-offset-2"
												>
													{page.title}
												</Link>
											</li>
										))}
									</ul>
								</AccordionContent>
							</AccordionItem>
						) : null}
					</Accordion>
				</article>
			</div>
		</div>
	);
}
