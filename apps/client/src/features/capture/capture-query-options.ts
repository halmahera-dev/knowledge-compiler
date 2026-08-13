import { queryOptions } from "@tanstack/react-query";
import { fetchItems } from "@/features/capture/capture-api";
import { captureKeys } from "@/features/capture/capture-cache";
import { fetchRuns } from "@/features/capture/run-api";
import { retryUnlessSignedOut } from "@/lib/api-client";

export function itemsQueryOptions() {
	return queryOptions({
		queryKey: captureKeys.items(),
		queryFn: fetchItems,
		retry: retryUnlessSignedOut,
	});
}

/**
 * The compile history.
 *
 * Not polled: the live half of the feed arrives over SSE, and this is
 * invalidated when a run reaches a terminal state. Polling on top of that would
 * be the same information twice, at a fixed cost per open tab.
 */
export function runsQueryOptions() {
	return queryOptions({
		queryKey: captureKeys.runs(),
		queryFn: fetchRuns,
		retry: retryUnlessSignedOut,
	});
}
