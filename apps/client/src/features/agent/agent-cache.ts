export const agentKeys = {
	threads: () => ["agent", "threads"] as const,
	thread: (id: string) => ["agent", "threads", id] as const,
};
