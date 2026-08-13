export const agentKeys = {
	/** Conversations in this workspace. */
	threads: () => ["agent", "threads"] as const,
	thread: (id: string) => ["agent", "threads", id] as const,
};
