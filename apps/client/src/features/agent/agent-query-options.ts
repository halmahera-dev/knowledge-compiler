import { queryOptions } from "@tanstack/react-query";
import { agentKeys } from "@/features/agent/agent-cache";
import {
  getThread,
  getThreadMessages,
  listThreads,
} from "@/features/agent/mastra-memory-api";

export function threadsQueryOptions() {
  return queryOptions({
    queryKey: agentKeys.threads(),
    queryFn: listThreads,
  });
}

export function threadQueryOptions(id: string) {
  return queryOptions({
    queryKey: agentKeys.thread(id),
    queryFn: async () => {
      const [thread, messages] = await Promise.all([
        getThread(id),
        getThreadMessages(id),
      ]);
      return { ...thread, messages };
    },
  });
}
