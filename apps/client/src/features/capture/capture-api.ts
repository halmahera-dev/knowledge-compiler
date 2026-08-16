/**
 * The one way in that still goes through the browser.
 *
 * Paste and link are saved by the copilot's saveToLibrary tool, from the
 * conversation — there is no JSON create here any more, because a browser call
 * would be a second path to the same endpoint with its own idea of what a
 * successful save looks like.
 *
 * A PDF cannot go that way: binary does not travel through a prompt. So it
 * uploads from here, straight to the API, and the model is not involved.
 */
import { request, upload } from "@/lib/api-client";

export interface CreateItemResult {
	itemId: string;
	runId: string | null;
	status: string;
	/** What the server called it. Derived there, so the browser cannot guess it. */
	title: string | null;
	duplicate: boolean;
	/** What a re-save collided with, so the refusal can be checked rather than trusted. */
	duplicateOf: {
		itemId: string;
		title: string | null;
		pageSlug: string | null;
	} | null;
	/** How many compiles a long document was split into. 1 for a normal save. */
	partsQueued: number;
}

export interface RawItem {
	id: string;
	captureType: string;
	sourceUrl: string | null;
	title: string | null;
	status: string;
	createdAt: string;
	excerpt: string;
}

export function uploadPdf(file: File): Promise<CreateItemResult> {
	const form = new FormData();
	form.append("file", file);
	return upload<CreateItemResult>("/api/v1/items/pdf", form);
}

export function fetchItems(): Promise<RawItem[]> {
	return request<RawItem[]>("/api/v1/items");
}
