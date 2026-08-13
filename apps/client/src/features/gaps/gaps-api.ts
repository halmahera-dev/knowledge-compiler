/**
 * Knowledge gaps: prerequisites the reading leans on but never covers.
 *
 * Raised by the compile pipeline, not by the browser — this is a view onto what
 * the agent noticed, plus the one action a reader can take on it.
 */
import { request } from "@/lib/api-client";

export interface Gap {
	id: string;
	question: string;
	reason: string;
	status: "open" | "dismissed" | "filled";
	createdAt: string;
	nodeLabel: string | null;
	nodeSlug: string | null;
}

export function fetchGaps(): Promise<Gap[]> {
	return request<Gap[]>("/api/v1/gaps");
}

export function dismissGap(id: string): Promise<void> {
	return request<void>(`/api/v1/gaps/${id}/dismiss`, { method: "POST" });
}
