import { useQuery } from "@tanstack/react-query";

import { graphQueryOptions } from "@/features/graph/graph-query-options";

export function useGraph() {
	return useQuery(graphQueryOptions());
}
