import { queryOptions } from "@tanstack/react-query";
import { fetchGaps } from "@/features/gaps/gaps-api";
import { gapsKeys } from "@/features/gaps/gaps-cache";
import { retryUnlessSignedOut } from "@/lib/api-client";

export function gapsQueryOptions() {
	return queryOptions({
		queryKey: gapsKeys.list(),
		queryFn: fetchGaps,
		retry: retryUnlessSignedOut,
	});
}
