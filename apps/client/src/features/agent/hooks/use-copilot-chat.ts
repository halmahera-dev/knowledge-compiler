"use client";

import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { agentKeys } from "@/features/agent/agent-cache";
import { getApiToken } from "@/features/user/user-token";

const MASTRA_URL = (
	process.env.NEXT_PUBLIC_MASTRA_URL ?? "http://localhost:4111"
).replace(/\/$/, "");

/**
 * Drives one conversation: streams the answer from the copilot agent and
 * lets Mastra's own memory persist the turn as part of that execution — no
 * separate save step.
 */
export function useCopilotChat(
	threadId: string | null,
	initialMessages: UIMessage[],
) {
	const queryClient = useQueryClient();
	const router = useRouter();

	// Minted once per mount (the component remounts on thread change via a
	// `key` prop) so Mastra can auto-create the thread under this id on the
	// first send, without needing to learn an id back from the response.
	const [activeThreadId] = useState(() => threadId ?? crypto.randomUUID());

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: `${MASTRA_URL}/chat`,
				prepareSendMessagesRequest: async ({ messages }) => {
					const token = await getApiToken();
					return {
						headers: token ? { Authorization: `Bearer ${token}` } : undefined,
						body: {
							messages,
							memory: { thread: activeThreadId },
						},
					};
				},
			}),
		[activeThreadId],
	);

	const { messages, sendMessage, status, stop, error, regenerate } = useChat({
		id: activeThreadId,
		messages: initialMessages,
		transport,
		onFinish: ({ isAbort, isError }) => {
			if (isAbort || isError) return;

			queryClient.invalidateQueries({ queryKey: agentKeys.threads() });
			queryClient.invalidateQueries({
				queryKey: agentKeys.thread(activeThreadId),
			});
			if (!threadId) router.replace(`/agent/${activeThreadId}`);
		},
		onError: (err) => {
			console.error("Chat stream error:", err);
		},
	});

	return { messages, sendMessage, status, stop, error, regenerate };
}
