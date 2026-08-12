import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { agentKeys } from "@/features/agent/agent-cache";
import { threadsQueryOptions } from "@/features/agent/agent-query-options";
import {
	createThread,
	deleteThread,
	renameThread,
} from "@/features/agent/mastra-memory-api";

export function useThreads() {
	return useQuery(threadsQueryOptions());
}

export function useCreateThread() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => createThread(crypto.randomUUID()),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: agentKeys.threads() });
		},
		onError: () => {
			toast.error("Could not start a new conversation.");
		},
	});
}

export function useDeleteThread() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => deleteThread(id),
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
			renameThread(id, title),
		onSuccess: (_data, { id }) => {
			queryClient.invalidateQueries({ queryKey: agentKeys.threads() });
			queryClient.invalidateQueries({ queryKey: agentKeys.thread(id) });
		},
		onError: () => {
			toast.error("Could not rename the conversation.");
		},
	});
}
