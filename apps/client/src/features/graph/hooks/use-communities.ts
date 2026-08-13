import { useQuery } from "@tanstack/react-query";

import { communitiesQueryOptions } from "@/features/graph/graph-query-options";

export function useCommunities() {
	return useQuery(communitiesQueryOptions());
}
