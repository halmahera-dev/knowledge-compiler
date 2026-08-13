/**
 * Compiled pages: the wiki the captures wrote.
 *
 * A page is never edited directly — every compile writes a revision, which is
 * what makes rollback a pointer change rather than a replay. The client only
 * reads and reverts.
 */
import { request } from "@/lib/api-client";

export interface ClaimSource {
	rawItemId: string;
	quote: string;
	stance: "supports" | "contradicts";
	sourceUrl: string | null;
	sourceTitle: string | null;
}

export interface Claim {
	id: string;
	section: string;
	position: number;
	text: string;
	status: "asserted" | "disputed" | "superseded";
	confidence: number;
	sources: ClaimSource[];
}

export interface PageSummary {
	id: string;
	slug: string;
	title: string;
	summary: string;
	updatedAt: string;
	sourceCount: number;
	claimCount: number;
	disputedCount: number;
}

export interface RevisionMeta {
	id: string;
	revisionNo: number;
	createdAt: string;
	action: string | null;
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

export interface PageDetail {
	id: string;
	slug: string;
	title: string;
	summary: string;
	createdAt: string;
	updatedAt: string;
	revisionNo: number;
	sections: { heading: string; body: string }[];
	claims: Claim[];
	sources: RawItem[];
	backlinks: PageSummary[];
	revisions: RevisionMeta[];
}

export function fetchPages(q?: string): Promise<PageSummary[]> {
	return request<PageSummary[]>(
		`/api/v1/pages${q ? `?q=${encodeURIComponent(q)}` : ""}`,
	);
}

export function fetchPage(slug: string): Promise<PageDetail> {
	return request<PageDetail>(`/api/v1/pages/${slug}`);
}

export function revertPage(
	pageId: string,
	revisionNo: number,
): Promise<PageDetail> {
	return request<PageDetail>(`/api/v1/pages/${pageId}/revert`, {
		method: "POST",
		body: JSON.stringify({ revisionNo }),
	});
}
