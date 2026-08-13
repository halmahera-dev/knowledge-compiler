"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@kc/ui/components/card";
import { Empty, EmptyDescription, EmptyTitle } from "@kc/ui/components/empty";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QueryError, QuerySkeleton } from "@/components/query-states";
import { captureKeys } from "@/features/capture/capture-cache";
import { useCompileFeed } from "@/features/capture/hooks/use-compile-feed";
import { retryRun } from "@/features/capture/run-api";
import { DiffCard, FailedCard, PendingCard, RunCard } from "./compile-diff";

/**
 * What each save did to the knowledge base, live.
 *
 * Order is deliberate: what is happening now, then what just failed, then what
 * just landed, then history. A reader who saved something ten seconds ago
 * should not have to scan past last week to find it.
 */
export function CompileFeed() {
	const { runs, history, live, completed, failed, connected, spoken, forget } =
		useCompileFeed();
	const queryClient = useQueryClient();

	const retry = useMutation({
		mutationFn: retryRun,
		onSuccess: (run) => {
			// The retried run comes back queued, so the overlay entry for its old
			// failure is stale — drop it and let the history show the new state.
			forget(run.id);
			queryClient.invalidateQueries({ queryKey: captureKeys.runs() });
		},
		onError: () => {
			toast.error("Could not queue that again.");
		},
	});

	const empty =
		live.length === 0 &&
		completed.length === 0 &&
		failed.length === 0 &&
		history.length === 0;

	return (
		<Card className="mt-6" data-tour="compile-feed">
			<CardHeader>
				<CardTitle className="text-base">Activity</CardTitle>
				<CardDescription>
					What each save did to the knowledge base.
					{connected ? null : (
						<span className="ml-2 text-destructive">
							Live feed disconnected — reconnecting.
						</span>
					)}
				</CardDescription>
			</CardHeader>

			<CardContent>
				{/* Announcements only. The cards themselves are not duplicated into
						the live region — hearing a whole diff read aloud is unusable. */}
				<p aria-live="polite" role="status" className="sr-only">
					{spoken}
				</p>

				{runs.isPending ? (
					<QuerySkeleton rows={3} className="h-28 rounded-xl" />
				) : runs.isError ? (
					<QueryError error={runs.error} />
				) : empty ? (
					<Empty>
						<EmptyTitle>Nothing compiled yet</EmptyTitle>
						<EmptyDescription>
							Save something above and you will watch it become a page.
						</EmptyDescription>
					</Empty>
				) : (
					<div className="flex flex-col gap-3">
						{live.map((run) => (
							<PendingCard
								key={run.runId}
								title={run.title}
								step={run.step}
								detail={run.detail}
							/>
						))}

						{failed.map((run) => (
							// No retry here: a failure seen over the stream has no settled
							// run row to re-queue yet. The history row below grows one.
							<FailedCard key={run.runId} title={run.title} error={run.error} />
						))}

						{completed.map((diff) => (
							<DiffCard key={diff.runId} diff={diff} />
						))}

						{history.map((run) => (
							<RunCard
								key={run.id}
								run={run}
								onRetry={
									// The API refuses anything else with a 409, so offering
									// the button for a running or succeeded run would be an
									// invitation to an error.
									run.status === "failed" || run.status === "queued"
										? async () => {
												await retry.mutateAsync(run.id);
											}
										: undefined
								}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
