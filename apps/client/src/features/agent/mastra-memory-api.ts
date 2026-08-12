/**
 * Client for Mastra's built-in memory API (`/api/memory/*`), which owns
 * thread CRUD and message storage for the copilot agent directly — no
 * Python API involved.
 *
 * `resourceId` is forced server-side from the reader's own bearer token
 * (see apps/agent/src/mastra/index.ts's `/api/memory/*` middleware), so a
 * browser can never read or write another user's threads by editing a
 * query param or body field.
 */
import type { UIMessage } from "ai";
import { getApiToken } from "@/features/user/user-token";

const MASTRA_URL = (
	process.env.NEXT_PUBLIC_MASTRA_URL ?? "http://localhost:4111"
).replace(/\/$/, "");

const AGENT_ID = "copilotAgent";

export interface MastraThread {
	id: string;
	title?: string;
	createdAt: string;
	updatedAt: string;
}

export class MastraApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "MastraApiError";
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const token = await getApiToken();
	if (!token) throw new MastraApiError("Sign in to use the copilot.", 401);

	const response = await fetch(`${MASTRA_URL}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
			...init?.headers,
		},
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new MastraApiError(
			body.slice(0, 200) || `Request failed with ${response.status}`,
			response.status,
		);
	}

	return (await response.json()) as T;
}

export async function listThreads(): Promise<MastraThread[]> {
	const { threads } = await request<{ threads: MastraThread[] }>(
		`/api/memory/threads?agentId=${AGENT_ID}`,
	);
	return threads;
}

export function getThread(id: string): Promise<MastraThread> {
	return request<MastraThread>(`/api/memory/threads/${id}?agentId=${AGENT_ID}`);
}

export async function getThreadMessages(id: string): Promise<UIMessage[]> {
	const { uiMessages } = await request<{ uiMessages: UIMessage[] }>(
		`/threads/${id}/messages?agentId=${AGENT_ID}`,
	);

	return uiMessages;
}

export function createThread(
	id: string,
	title?: string,
): Promise<MastraThread> {
	return request<MastraThread>(`/api/memory/threads?agentId=${AGENT_ID}`, {
		method: "POST",
		// `resourceId` is required by the route's schema but ignored/overridden
		// server-side, so any placeholder satisfies it.
		body: JSON.stringify({ resourceId: "self", threadId: id, title }),
	});
}

export function renameThread(id: string, title: string): Promise<MastraThread> {
	return request<MastraThread>(
		`/api/memory/threads/${id}?agentId=${AGENT_ID}`,
		{
			method: "PATCH",
			body: JSON.stringify({ title }),
		},
	);
}

export function deleteThread(id: string): Promise<void> {
	return request<void>(`/api/memory/threads/${id}?agentId=${AGENT_ID}`, {
		method: "DELETE",
	});
}
