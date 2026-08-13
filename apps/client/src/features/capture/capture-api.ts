/**
 * The four ways into the knowledge base.
 *
 * All four converge on the same artifact server-side, so nothing downstream
 * branches on how something was saved. The browser's only job is to hand over
 * the material and report what came back.
 */
import { request, upload } from "@/lib/api-client";

export type CaptureType = "paste" | "link" | "clip" | "pdf";

export interface CreateItemResult {
	itemId: string;
	runId: string | null;
	status: string;
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

export function createItem(payload: {
	// PDFs go to uploadPdf — this endpoint takes JSON and has no file to read.
	captureType: Exclude<CaptureType, "pdf">;
	content?: string;
	sourceUrl?: string;
	title?: string;
}): Promise<CreateItemResult> {
	return request<CreateItemResult>("/api/v1/items", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function uploadPdf(file: File): Promise<CreateItemResult> {
	const form = new FormData();
	form.append("file", file);
	return upload<CreateItemResult>("/api/v1/items/pdf", form);
}

export function fetchItems(): Promise<RawItem[]> {
	return request<RawItem[]>("/api/v1/items");
}
