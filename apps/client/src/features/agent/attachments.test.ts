import { describe, expect, test } from "vitest";
import { describeUpload } from "@/features/agent/attachments";
import type { CreateItemResult } from "@/features/capture/capture-api";

function result(over: Partial<CreateItemResult> = {}): CreateItemResult {
	return {
		itemId: "i1",
		runId: "r1",
		status: "queued",
		title: "A Paper",
		duplicate: false,
		duplicateOf: null,
		partsQueued: 1,
		...over,
	};
}

describe("describeUpload", () => {
	test("names the title the server derived", () => {
		const described = describeUpload(result());

		expect(described.state).toBe("saved");
		expect(described.detail).toBe("A Paper — compiling");
	});

	test("says how many parts a long document became", () => {
		expect(describeUpload(result({ partsQueued: 9 })).detail).toBe(
			"A Paper — long enough to split into 9 parts, compiling",
		);
	});

	test("a duplicate names what it matched, so the refusal can be checked", () => {
		const described = describeUpload(
			result({
				duplicate: true,
				duplicateOf: { itemId: "i0", title: "A Paper", pageSlug: "a-paper" },
			}),
		);

		expect(described.state).toBe("duplicate");
		expect(described.detail).toBe("Already saved as “A Paper”");
	});

	test("a duplicate with nothing to name still reads as a refusal", () => {
		expect(
			describeUpload(result({ duplicate: true, duplicateOf: null })).detail,
		).toBe("Already saved");
	});

	test("survives a save the server could not title", () => {
		expect(describeUpload(result({ title: null })).detail).toBe(
			"Saved — compiling",
		);
	});
});
