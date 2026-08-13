/**
 * Reading the evidence off an answer.
 *
 * The product's claim is that every sentence is checkable, and this is the step
 * that turns a `[c2]` marker back into a claim the reader can open. It has one
 * genuinely hard case — the tool restarts its labels at `c1` on every call, so a
 * turn with two searches has two `c1`s — and the rule there is to resolve to
 * nothing rather than to link a citation to a page it may not belong to.
 */
import { describe, expect, it } from "vitest";

import {
	assistantText,
	type CopilotUIMessage,
	citedLabels,
	type LabelledClaim,
	readEvidence,
} from "./copilot-evidence";

function claim(n: number, label: string): LabelledClaim {
	return {
		claimId: `claim-${n}`,
		text: `claim ${n}`,
		section: "s",
		status: "asserted",
		pageSlug: `page-${n}`,
		pageTitle: `Page ${n}`,
		quote: `quote ${n}`,
		sourceTitle: null,
		sourceUrl: null,
		label,
	};
}

function message(
	text: string,
	outputs: { claims?: LabelledClaim[]; blocked?: string | null }[] = [],
): CopilotUIMessage {
	return {
		id: "m1",
		role: "assistant",
		parts: [
			...outputs.map((output) => ({
				type: "tool-searchKnowledge" as const,
				state: "output-available" as const,
				output,
			})),
			{ type: "text" as const, text },
		],
	} as unknown as CopilotUIMessage;
}

describe("citedLabels", () => {
	it("reads a single label", () => {
		expect(citedLabels("Weights are quantised [c1].")).toEqual(["c1"]);
	});

	it("reads labels grouped in one bracket", () => {
		expect(citedLabels("Outliers dominate [c2, c3].")).toEqual(["c2", "c3"]);
	});

	it("reads adjacent brackets", () => {
		expect(citedLabels("Both hold [c1][c2].")).toEqual(["c1", "c2"]);
	});

	it("does not repeat a label cited twice", () => {
		expect(citedLabels("As [c1] shows, and again [c1].")).toEqual(["c1"]);
	});

	it("finds nothing in prose with no citations", () => {
		expect(citedLabels("No evidence was found.")).toEqual([]);
	});
});

describe("readEvidence", () => {
	it("resolves cited labels to their claims", () => {
		const evidence = readEvidence(
			message("Quantisation reduces size [c1].", [
				{ claims: [claim(1, "c1"), claim(2, "c2")] },
			]),
		);

		expect(evidence.citations).toEqual([
			{ claimId: "claim-1", pageSlug: "page-1", pageTitle: "Page 1" },
		]);
		// Everything the tool returned is kept, cited or not — "12 consulted,
		// 1 cited" is the honest thing to show.
		expect(evidence.claims).toHaveLength(2);
		expect(evidence.refused).toBe(false);
	});

	it("marks an answer that cites nothing as not grounded", () => {
		const evidence = readEvidence(
			message("I could not find anything.", [{ claims: [claim(1, "c1")] }]),
		);
		expect(evidence.refused).toBe(true);
		expect(evidence.citations).toEqual([]);
	});

	it("ignores a label that points past the end", () => {
		const evidence = readEvidence(
			message("As shown [c9].", [{ claims: [claim(1, "c1")] }]),
		);
		expect(evidence.citations).toEqual([]);
	});

	it("refuses to resolve a label two searches gave different meanings", () => {
		// The hard case. Both calls produced a `c1`, for different claims — so the
		// marker is ambiguous to the model as well, and linking it would be a
		// guess presented as provenance.
		const evidence = readEvidence(
			message("It follows [c1].", [
				{ claims: [claim(1, "c1")] },
				{ claims: [claim(2, "c1")] },
			]),
		);

		expect(evidence.byLabel.get("c1")).toBeNull();
		expect(evidence.citations).toEqual([]);
		// Both claims are still consulted evidence and still listed.
		expect(evidence.claims.map((c) => c.claimId)).toEqual([
			"claim-1",
			"claim-2",
		]);
	});

	it("keeps a label two searches agreed on", () => {
		const evidence = readEvidence(
			message("It follows [c1].", [
				{ claims: [claim(1, "c1")] },
				{ claims: [claim(1, "c1")] },
			]),
		);

		expect(evidence.byLabel.get("c1")?.claimId).toBe("claim-1");
		expect(evidence.claims).toHaveLength(1);
		expect(evidence.citations).toHaveLength(1);
	});

	it("surfaces a blocked message from the tool", () => {
		const evidence = readEvidence(
			message("You are not signed in.", [
				{
					claims: [],
					blocked: "Your session has expired. Sign in again to ask.",
				},
			]),
		);
		expect(evidence.blocked).toMatch(/session has expired/);
	});

	it("prefers stored evidence over tool parts, so a reload renders identically", () => {
		const stored = {
			id: "m1",
			role: "assistant",
			parts: [{ type: "text", text: "Quantisation reduces size [c1]." }],
			metadata: {
				citations: [
					{ claimId: "claim-1", pageSlug: "page-1", pageTitle: "Page 1" },
				],
				claims: [claim(1, "c1")],
				refused: false,
			},
		} as unknown as CopilotUIMessage;

		const evidence = readEvidence(stored);
		expect(evidence.citations).toHaveLength(1);
		expect(evidence.byLabel.get("c1")?.claimId).toBe("claim-1");
		expect(evidence.refused).toBe(false);
	});
});

describe("assistantText", () => {
	it("joins every text part, since a stream arrives in pieces", () => {
		expect(assistantText(message("one") as never)).toBe("one");
	});

	it("is empty for a message that is not there", () => {
		expect(assistantText(undefined)).toBe("");
	});
});
