import { queryOptions } from "@tanstack/react-query";
import { fetchCommunities } from "@/features/graph/graph-api";
import { graphKeys } from "@/features/graph/graph-cache";
import { fetchGraph } from "@/features/graph/graph-data";
import { retryUnlessSignedOut } from "@/lib/api-client";

export function graphQueryOptions() {
	return queryOptions({
		queryKey: graphKeys.graph(),
		queryFn: fetchGraph,
		// The graph itself changes only when something is compiled, and refetching
		// it costs the reader a full relayout of the canvas they are looking at.
		staleTime: 60_000,
		retry: retryUnlessSignedOut,
	});
}

export function communitiesQueryOptions() {
	return queryOptions({
		queryKey: graphKeys.communities(),
		queryFn: fetchCommunities,
		// Cluster names change only when something is compiled, which is rare
		// relative to how often this page is opened.
		staleTime: 60_000,
		retry: retryUnlessSignedOut,
	});
}
