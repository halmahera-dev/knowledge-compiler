import { queryOptions } from "@tanstack/react-query";
import { agentKeys } from "@/features/agent/agent-cache";
import { getSession, listSessions } from "@/features/agent/chat-api";
import { retryUnlessSignedOut } from "@/lib/api-client";

export function threadsQueryOptions() {
	return queryOptions({
		queryKey: agentKeys.threads(),
		queryFn: listSessions,
		retry: retryUnlessSignedOut,
	});
}

export function threadQueryOptions(id: string) {
	return queryOptions({
		queryKey: agentKeys.thread(id),
		queryFn: () => getSession(id),
		retry: retryUnlessSignedOut,
	});
}
