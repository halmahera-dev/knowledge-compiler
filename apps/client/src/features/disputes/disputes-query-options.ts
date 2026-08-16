import { queryOptions } from "@tanstack/react-query";
import { fetchDisputes } from "@/features/disputes/disputes-api";
import { disputesKeys } from "@/features/disputes/disputes-cache";
import { retryUnlessSignedOut } from "@/lib/api-client";

export function disputesQueryOptions() {
	return queryOptions({
		queryKey: disputesKeys.list(),
		queryFn: fetchDisputes,
		retry: retryUnlessSignedOut,
	});
}
