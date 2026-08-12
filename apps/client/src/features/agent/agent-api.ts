/**
 * Evidence types for the copilot's answers.
 *
 * These are derived client-side from the `searchKnowledge` tool-call parts
 * embedded in each streamed message (see `extractEvidence` in
 * `use-copilot-chat.ts`) — Mastra's own memory persists those tool parts, so
 * citations survive a reload without a separate store.
 */
export type ClaimStatus = "asserted" | "disputed" | "superseded";

export interface RetrievedClaim {
	claimId: string;
	text: string;
	section: string;
	status: ClaimStatus;
	pageSlug: string;
	pageTitle: string;
	quote: string;
	sourceTitle: string | null;
	sourceUrl: string | null;
}

export interface Citation {
	claimId: string;
	pageSlug: string;
	pageTitle: string;
}
