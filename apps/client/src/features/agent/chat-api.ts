/**
 * Conversations, stored by the Python API.
 *
 * The agent answers; this is where the answer is kept. A thread belongs to the
 * **workspace**, not to the person who opened it — what is being asked about is
 * the workspace's compiled wiki, so a colleague can read how a conclusion was
 * reached rather than only the conclusion.
 *
 * This replaces the Mastra memory client. Mastra scopes threads by the signed-in
 * user, which is a different boundary from the one the evidence lives behind.
 */
import { request } from "@/lib/api-client";
import type {
	Citation,
	CopilotUIMessage,
	RetrievedClaim,
	TurnPayload,
} from "./copilot-evidence";

export interface ChatSession {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messageCount: number;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	citations: Citation[];
	claims: RetrievedClaim[];
	refused: boolean;
	createdAt: string;
}

export interface ChatSessionDetail extends ChatSession {
	messages: ChatMessage[];
}

export async function listSessions(): Promise<ChatSession[]> {
	const sessions = await request<ChatSession[]>("/api/v1/chat/sessions");
	// A session is created before its first question is answered, so an abandoned
	// composer leaves an empty row. Showing it would offer a conversation that
	// contains nothing.
	return sessions.filter((session) => session.messageCount > 0);
}

export function getSession(id: string): Promise<ChatSessionDetail> {
	return request<ChatSessionDetail>(`/api/v1/chat/sessions/${id}`);
}

export function createSession(): Promise<ChatSessionDetail> {
	return request<ChatSessionDetail>("/api/v1/chat/sessions", {
		method: "POST",
		body: JSON.stringify({}),
	});
}

/** Records a finished exchange and returns the whole thread as stored. */
export function appendTurn(
	id: string,
	payload: TurnPayload,
): Promise<ChatSessionDetail> {
	return request<ChatSessionDetail>(`/api/v1/chat/sessions/${id}/turns`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function renameSession(id: string, title: string): Promise<ChatSession> {
	return request<ChatSession>(`/api/v1/chat/sessions/${id}`, {
		method: "PATCH",
		body: JSON.stringify({ title }),
	});
}

export function deleteSession(id: string): Promise<void> {
	return request<void>(`/api/v1/chat/sessions/${id}`, { method: "DELETE" });
}

/**
 * A stored thread, in the shape the live chat renders.
 *
 * Both paths converge here so a reload cannot look different from what the
 * reader watched arrive. The evidence rides along as metadata, which
 * `readEvidence` prefers over the tool parts a restored message does not have.
 */
export function toUIMessages(detail: ChatSessionDetail): CopilotUIMessage[] {
	return detail.messages.map((message) => ({
		id: message.id,
		role: message.role,
		parts: [{ type: "text" as const, text: message.content }],
		...(message.role === "assistant"
			? {
					metadata: {
						citations: message.citations ?? [],
						claims: message.claims ?? [],
						refused: message.refused,
					},
				}
			: {}),
	})) as CopilotUIMessage[];
}
