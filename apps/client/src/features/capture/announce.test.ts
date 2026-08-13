/**
 * The spoken half of the compile feed.
 *
 * Everything here has been wrong at least once: a doubled terminator that reads
 * as a stumble, and a derived title that read eighty characters of prose aloud
 * before saying anything useful.
 */
import { describe, expect, it } from "vitest";

import { announce, sentence, spokenTitle } from "./announce";
import type { CompileDiff } from "./run-api";

function diff(overrides: Partial<CompileDiff> = {}): CompileDiff {
	return {
		runId: "r1",
		rawItemId: "i1",
		action: "create",
		page: {
			id: "p1",
			slug: "quantisation",
			title: "Quantisation",
			revisionNo: 1,
		},
		claimsAdded: 3,
		claimsDisputed: 0,
		sectionsAdded: [],
		nodesCreated: [],
		edgesCreated: [],
		gapsRaised: [],
		reasoning: "",
		...overrides,
	};
}

describe("sentence", () => {
	it("adds a terminator when there is none", () => {
		expect(sentence("Created Quantisation")).toBe("Created Quantisation.");
	});

	it("does not double one that is already there", () => {
		// "…." is heard as a stumble, not a pause.
		expect(sentence("Created a long title…")).toBe("Created a long title…");
		expect(sentence("Done!")).toBe("Done!");
	});
});

describe("spokenTitle", () => {
	it("leaves a short title alone", () => {
		expect(spokenTitle("Quantisation")).toBe("Quantisation");
	});

	it("cuts on a word boundary, because a severed word is worse heard than seen", () => {
		const spoken = spokenTitle(
			"Post training quantisation and the accuracy cliff it introduces",
			32,
		);
		expect(spoken.endsWith("…")).toBe(true);
		expect(spoken.length).toBeLessThanOrEqual(33);
		expect(spoken).not.toMatch(/intro$/);
	});

	it("still cuts when there is no space to cut on", () => {
		expect(spokenTitle("x".repeat(80), 20).length).toBeLessThanOrEqual(21);
	});

	it("names something rather than nothing when there is no title", () => {
		for (const value of [null, "", "   ", "…"]) {
			expect(spokenTitle(value)).toBe("a saved item");
		}
	});
});

describe("announce", () => {
	it("says what happened and how much landed", () => {
		expect(announce(diff())).toBe("Created Quantisation. 3 claims added.");
	});

	it("uses the verb that matches the action", () => {
		expect(announce(diff({ action: "merge" }))).toMatch(/^Merged into /);
		expect(announce(diff({ action: "addendum" }))).toMatch(/^Added to /);
	});

	it("mentions disputes, which are the part worth interrupting for", () => {
		expect(announce(diff({ claimsDisputed: 2 }))).toBe(
			"Created Quantisation. 3 claims added, 2 disputed.",
		);
	});

	it("stays silent about disputes when there are none", () => {
		expect(announce(diff({ claimsDisputed: 0 }))).not.toMatch(/disputed/);
	});
});
