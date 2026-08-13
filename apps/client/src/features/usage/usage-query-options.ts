import { queryOptions } from "@tanstack/react-query";
import { fetchUsage } from "@/features/usage/usage-api";
import { usageKeys } from "@/features/usage/usage-cache";
import { retryUnlessSignedOut } from "@/lib/api-client";

export function usageQueryOptions(
	params: { days?: number; operation?: string; limit?: number } = {},
) {
	return queryOptions({
		queryKey: usageKeys.list(params),
		queryFn: () => fetchUsage(params),
		retry: retryUnlessSignedOut,
	});
}
