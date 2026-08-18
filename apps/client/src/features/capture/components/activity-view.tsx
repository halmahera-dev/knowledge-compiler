"use client";

import { PageHeader } from "@/components/page-header";
import { CompileFeed } from "@/features/capture/components/compile-feed";

/**
 * What each save did, as its own page.
 *
 * It sat under the wiki index for a while, which put the record of the last
 * thirty seconds below every page ever compiled — the one thing worth reading
 * straight after a save was the one thing furthest down. Read as a continuation
 * of the results, too.
 *
 * The wiki is the state; this is the changelog. Keeping them apart is what lets
 * either be read: "what do I have" and "what just happened" are different
 * questions, and only the second one has a retry button.
 */
export function ActivityView() {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title="Activity">
				<span className="ml-auto hidden text-muted-foreground text-xs md:block">
					Every save, and what it changed
				</span>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
				<CompileFeed />
			</div>
		</div>
	);
}
