import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { agentKeys } from "@/features/agent/agent-cache";
import { threadsQueryOptions } from "@/features/agent/agent-query-options";
import { deleteSession, renameSession } from "@/features/agent/chat-api";

export function useThreads() {
	return useQuery(threadsQueryOptions());
}

/**
 * There is no `useCreateThread`.
 *
 * A conversation is created by the composer at the moment the first question is
 * sent, because its id becomes the route. Creating one from anywhere else leaves
 * an empty row in the list that promises a conversation containing nothing.
 */

export function useDeleteThread() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => deleteSession(id),
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: agentKeys.threads() });
			queryClient.removeQueries({ queryKey: agentKeys.thread(id) });
		},
		onError: () => {
			toast.error("Could not delete the conversation.");
		},
	});
}

export function useRenameThread() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, title }: { id: string; title: string }) =>
			renameSession(id, title),
		onSuccess: (_data, { id }) => {
			queryClient.invalidateQueries({ queryKey: agentKeys.threads() });
			queryClient.invalidateQueries({ queryKey: agentKeys.thread(id) });
		},
		onError: () => {
			toast.error("Could not rename the conversation.");
		},
	});
}
