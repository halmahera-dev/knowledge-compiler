/**
 * Claims the compiler could not reconcile.
 *
 * Raised on the write path, like gaps — this is a view onto what the compiler
 * noticed, and there is deliberately nothing here to resolve them with.
 */
import { request } from "@/lib/api-client";

export interface DisputeSide {
	stance: "supports" | "contradicts";
	quote: string;
	sourceTitle: string | null;
	sourceUrl: string | null;
	savedAt: string;
}

export interface Dispute {
	claimId: string;
	text: string;
	section: string;
	pageSlug: string;
	pageTitle: string;
	sides: DisputeSide[];
}

export function fetchDisputes(): Promise<Dispute[]> {
	return request<Dispute[]>("/api/v1/disputes");
}
