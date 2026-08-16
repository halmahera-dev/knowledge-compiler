/**
 * What an answer rests on.
 *
 * The copilot searches through a tool, cites what it found with `[c1]`-style
 * labels, and the reader is entitled to check every one. This module is the only
 * place that knows how to read that back out of a message — the view renders it,
 * the persistence layer stores it, and neither derives it independently.
 *
 * Pure by design: no React, no fetch. The rules here are the ones worth testing.
 */
import type { UIMessage } from "ai";

export type ClaimStatus = "asserted" | "disputed" | "superseded";

/** A claim as the API returns it: the sentence, and the source behind it. */
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

/** The same, plus the label the model was told to cite it by. */
export interface LabelledClaim extends RetrievedClaim {
	label: string;
}

export interface Citation {
	claimId: string;
	pageSlug: string;
	pageTitle: string;
}

/** Evidence travelling with a message rebuilt from storage rather than a stream. */
export interface StoredEvidence {
	citations: Citation[];
	claims: RetrievedClaim[];
	refused: boolean;
}

export type CopilotUIMessage = UIMessage<StoredEvidence>;

export interface Evidence {
	/** Every claim consulted this turn, deduped, in the order they were returned. */
	claims: RetrievedClaim[];
	/**
	 * Label to claim — or `null` where one label was used for two different
	 * claims, which the client cannot untangle. See `readEvidence`.
	 */
	byLabel: ReadonlyMap<string, LabelledClaim | null>;
	/** Claims a `[cN]` marker actually pointed at, first appearance first. */
	citations: Citation[];
	/** True when nothing in the answer is anchored to a claim. */
	refused: boolean;
	/** A reader-facing message the tool relayed instead of searching. */
	blocked: string | null;
	/**
	 * How many searches this answer needed.
	 *
	 * Zero is the ordinary case: the briefing is compiled when the reader saves
	 * something, and retrieval is for pulling a quote. This is the only number
	 * on screen that can be checked against the product's own claim, so it
	 * counts calls that were made — including one that came back refusing.
	 */
	retrievalCount: number;
}

/**
 * One bracket of citations.
 *
 * Handles `[c1]`, `[c2, c3]` and `[c1][c2]` — the shapes models produce
 * unprompted. Parsing only the first cost the retired app real accuracy: a
 * well-grounded answer that grouped its citations looked like it rested on one.
 */
export const CITATION_GROUP = /\[([^\]]*?c\d+[^\]]*?)\]/g;

const LABEL = /c\d+/g;

/** Every text part of a message, concatenated. */
export function assistantText(message: UIMessage | undefined): string {
	if (!message) return "";
	return message.parts
		.filter(
			(part): part is { type: "text"; text: string } => part.type === "text",
		)
		.map((part) => part.text)
		.join("");
}

/** The labels an answer cites, in order of first appearance, deduped. */
export function citedLabels(text: string): string[] {
	const seen = new Set<string>();
	for (const group of text.matchAll(CITATION_GROUP)) {
		for (const label of group[1]?.matchAll(LABEL) ?? []) {
			seen.add(label[0]);
		}
	}
	return [...seen];
}

interface ToolOutput {
	claims?: LabelledClaim[];
	blocked?: string | null;
}

function toolOutputs(message: UIMessage): ToolOutput[] {
	return message.parts
		.filter(
			(part) =>
				part.type === "tool-searchKnowledge" &&
				"state" in part &&
				part.state === "output-available",
		)
		.map((part) => (part as unknown as { output: ToolOutput }).output ?? {});
}

/**
 * Read the evidence off a message, however it got here.
 *
 * A message restored from the API carries it as metadata; one that just streamed
 * carries it in the tool parts. Both render through the same path so a reload
 * cannot look different from what the reader watched arrive.
 */
export function readEvidence(message: CopilotUIMessage): Evidence {
	const text = assistantText(message);

	const stored = message.metadata;
	if (stored) {
		const byLabel = new Map<string, LabelledClaim | null>(
			stored.claims.map((claim, i) => [
				`c${i + 1}`,
				{ ...claim, label: `c${i + 1}` },
			]),
		);
		return {
			claims: stored.claims,
			byLabel,
			citations: stored.citations,
			refused: stored.refused,
			blocked: null,
			// Not recoverable from a stored turn: the count is not persisted, and
			// inferring it from the claims would report a search for every answer
			// that quoted one. Reported as unknown rather than guessed at.
			retrievalCount: 0,
		};
	}

	const byLabel = new Map<string, LabelledClaim | null>();
	const claims: RetrievedClaim[] = [];
	const seen = new Set<string>();
	let blocked: string | null = null;

	const outputs = toolOutputs(message);

	for (const output of outputs) {
		blocked ??= output.blocked ?? null;

		for (const claim of output.claims ?? []) {
			if (!seen.has(claim.claimId)) {
				seen.add(claim.claimId);
				claims.push(claim);
			}

			// The tool restarts its labels at c1 for every call, so two searches in
			// one turn both produce a `c1`. When they mean different claims the
			// label is ambiguous *to the model too*, and no client-side rule can
			// recover the truth — so it resolves to nothing rather than to a
			// plausible guess that would link a citation to the wrong page.
			const existing = byLabel.get(claim.label);
			if (existing === undefined) {
				byLabel.set(claim.label, claim);
			} else if (existing === null || existing.claimId !== claim.claimId) {
				byLabel.set(claim.label, null);
			}
		}
	}

	const citations: Citation[] = [];
	const cited = new Set<string>();
	for (const label of citedLabels(text)) {
		const claim = byLabel.get(label);
		if (!claim || cited.has(claim.claimId)) continue;
		cited.add(claim.claimId);
		citations.push({
			claimId: claim.claimId,
			pageSlug: claim.pageSlug,
			pageTitle: claim.pageTitle,
		});
	}

	return {
		claims,
		byLabel,
		citations,
		// An answer that cites nothing is either a refusal or unsupported. Either
		// way the reader should be told it is not anchored — the same rule the
		// retired two-step workflow applied.
		refused: citations.length === 0,
		blocked,
		retrievalCount: outputs.length,
	};
}

export interface TurnPayload {
	question: string;
	answer: string;
	citations: Citation[];
	claims: RetrievedClaim[];
	refused: boolean;
}

/** Shape a finished exchange for `POST /chat/sessions/{id}/turns`. */
export function toTurnPayload(
	question: string,
	answer: string,
	evidence: Evidence,
): TurnPayload {
	return {
		question,
		answer,
		citations: evidence.citations,
		claims: evidence.claims,
		refused: evidence.refused,
	};
}
