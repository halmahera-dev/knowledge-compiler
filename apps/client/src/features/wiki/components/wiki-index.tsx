"use client";

import { Badge } from "@kc/ui/components/badge";
import { buttonVariants } from "@kc/ui/components/button";
import { Card, CardContent } from "@kc/ui/components/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyTitle,
} from "@kc/ui/components/empty";
import { Input } from "@kc/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { QueryError, QuerySkeleton } from "@/components/query-states";
import { CompileFeed } from "@/features/capture/components/compile-feed";
import { TourButton } from "@/features/tour/tour-button";
import { pagesQueryOptions } from "@/features/wiki/wiki-query-options";

/**
 * Every page the captures compiled into.
 *
 * Search runs on the server rather than filtering the loaded list: the API
 * already has an index for it, and filtering in the browser would only ever
 * search the page the reader happens to have fetched.
 */

function WikiList({ query }: { query: string }) {
	const pages = useQuery(pagesQueryOptions(query.trim() || undefined));

	if (pages.isPending)
		return <QuerySkeleton rows={3} className="h-28 rounded-xl" />;
	if (pages.isError) return <QueryError error={pages.error} />;

	if (pages.data.length === 0) {
		return (
			<Empty>
				<EmptyTitle>
					{query ? "Nothing matches that" : "No pages yet"}
				</EmptyTitle>
				<EmptyDescription>
					{query
						? "Try a different term, or clear the search."
						: "Paste a link or an article to the agent and a page will compile itself."}
				</EmptyDescription>

				{/* An empty workspace is the one moment the tour is worth offering
				    unprompted: there is nothing here to read, and the reader has not
				    yet been anywhere that would have shown them the sidebar's button. */}
				{query ? null : (
					<EmptyContent className="flex-row gap-3">
						<Link href="/agent" className={buttonVariants()}>
							Save your first thing
						</Link>
						<TourButton />
					</EmptyContent>
				)}
			</Empty>
		);
	}

	return (
		<ul className="flex flex-col gap-3">
			{pages.data.map((page) => (
				<li key={page.id}>
					<Card className="relative transition-colors hover:border-foreground/20">
						<CardContent>
							<Link
								href={`/${page.slug}`}
								className="font-medium after:absolute after:inset-0 hover:underline"
							>
								{page.title}
							</Link>
							<p className="mt-1 line-clamp-2 text-muted-foreground text-sm leading-relaxed">
								{page.summary}
							</p>

							<div className="mt-3 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
								<span>
									{page.claimCount} claim{page.claimCount === 1 ? "" : "s"}
								</span>
								<span aria-hidden="true">·</span>
								<span>
									{page.sourceCount} source{page.sourceCount === 1 ? "" : "s"}
								</span>
								{page.disputedCount > 0 ? (
									// Worth a badge rather than a count in the run of text: a
									// contradiction is the one thing on this card a reader would
									// want to open the page for.
									<Badge variant="destructive">
										{page.disputedCount} disputed
									</Badge>
								) : null}
								<span className="ml-auto">
									{new Date(page.updatedAt).toLocaleDateString()}
								</span>
							</div>
						</CardContent>
					</Card>
				</li>
			))}
		</ul>
	);
}

export function WikiIndex() {
	const [query, setQuery] = useState("");

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title="Wiki">
				<div className="ml-auto w-full max-w-64">
					<Input
						type="search"
						placeholder="Search pages…"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						aria-label="Search pages"
					/>
				</div>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
				<WikiList query={query} />

				{/* Saving happens in the conversation now, so the place to watch a
				    save land is the place the reading happens. Hidden while a search
				    is running: the list above is then a filtered view, and an
				    unfiltered activity log under it reads as part of the results. */}
				{query ? null : <CompileFeed />}
			</div>
		</div>
	);
}
