"use client";

import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { useCallback, useMemo, useRef, useState } from "react";
import { agentKeys } from "@/features/agent/agent-cache";
import { appendTurn } from "@/features/agent/chat-api";
import {
	assistantText,
	type CopilotUIMessage,
	readEvidence,
	type TurnPayload,
} from "@/features/agent/copilot-evidence";
import { getApiToken } from "@/features/user/user-token";
import { isSignedOut } from "@/lib/api-client";

const MASTRA_URL = (
	process.env.NEXT_PUBLIC_MASTRA_URL ?? "http://localhost:4111"
).replace(/\/$/, "");

/** Why a finished turn is not in the workspace's history. */
export type UnsavedReason = "network" | "signed-out" | "no-workspace" | "gone";

function classify(error: unknown): UnsavedReason {
	if (isSignedOut(error)) return "signed-out";
	const status =
		typeof error === "object" && error !== null && "status" in error
			? (error as { status: unknown }).status
			: null;
	if (status === 409) return "no-workspace";
	if (status === 404) return "gone";
	return "network";
}

/**
 * One conversation: the agent answers, the API stores it.
 *
 * Mastra's own memory is deliberately not used. The transport already ships the
 * whole visible history on every turn, so recalling a thread server-side would
 * give two answers to "what has been said" — and Mastra scopes threads by the
 * signed-in user while conversations here belong to the workspace, which is a
 * different boundary. `POST /chat` omits memory entirely when no thread is sent.
 */
export function useCopilotChat(
	sessionId: string,
	initialMessages: CopilotUIMessage[],
) {
	const queryClient = useQueryClient();
	const [unsaved, setUnsaved] = useState<ReadonlyMap<string, UnsavedReason>>(
		new Map(),
	);

	// Turns waiting to be stored, in the order they happened. Draining in order
	// matters: if turn 1 failed and turn 2 succeeded, the stored thread would
	// have a hole in it and read as though a question was never asked.
	const queue = useRef<{ messageId: string; payload: TurnPayload }[]>([]);
	const flushing = useRef(false);

	const flush = useCallback(async () => {
		if (flushing.current) return;
		flushing.current = true;

		try {
			while (queue.current.length > 0) {
				const next = queue.current[0];
				try {
					const stored = await appendTurn(sessionId, next.payload);
					queue.current.shift();
					setUnsaved((current) => {
						const map = new Map(current);
						map.delete(next.messageId);
						return map;
					});
					// Primed rather than invalidated: the answer is already on screen,
					// and refetching it would blank and redraw what the reader is
					// reading.
					queryClient.setQueryData(agentKeys.thread(sessionId), stored);
					queryClient.invalidateQueries({ queryKey: agentKeys.threads() });
				} catch (error) {
					const reason = classify(error);
					setUnsaved((current) => new Map(current).set(next.messageId, reason));
					break;
				}
			}
		} finally {
			flushing.current = false;
		}
	}, [queryClient, sessionId]);

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: `${MASTRA_URL}/chat`,
				prepareSendMessagesRequest: async ({ messages }) => {
					const token = await getApiToken();
					return {
						headers: token ? { Authorization: `Bearer ${token}` } : undefined,
						// No `memory`: see the note above. `chatSessionId` is for
						// accounting only — the agent reports what the answer cost
						// against this conversation, or copilot spend never reaches
						// /ai-logs.
						body: { messages, chatSessionId: sessionId },
					};
				},
			}),
		[sessionId],
	);

	const chat = useChat<CopilotUIMessage>({
		id: sessionId,
		messages: initialMessages,
		transport,
		onFinish: ({ message, messages, isAbort, isError, isDisconnect }) => {
			if (isAbort || isError || isDisconnect) return;

			const evidence = readEvidence(message);
			// A relayed 401/403/409 means `POST /turns` would fail the same way, and
			// storing it would file an auth failure as though it were an answer.
			if (evidence.blocked) return;

			const answer = assistantText(message);
			const question = assistantText(messages.at(-2));
			if (!answer || !question) return;

			queue.current.push({
				messageId: message.id,
				payload: {
					question,
					answer,
					citations: evidence.citations,
					claims: evidence.claims,
					refused: evidence.refused,
				},
			});
			void flush();
		},
	});

	return { ...chat, unsaved, retrySave: flush };
}
