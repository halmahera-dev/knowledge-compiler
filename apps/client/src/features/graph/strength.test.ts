/**
 * The strength filter puts two different measurements on one slider, which is
 * the part worth pinning down: an asserted relation's confidence is absolute,
 * a derived edge's shared-source count is only meaningful next to the busiest
 * pair in the same graph. Get the normalisation wrong and the slider hides the
 * wrong half of the graph, silently — every edge is still drawable, so nothing
 * errors.
 */
import { describe, expect, test } from "vitest";
import { maxSharedSources, relationshipStrength } from "./strength";
import type { GraphRelationship } from "./types";

function edge(properties: GraphRelationship["properties"]): GraphRelationship {
	return {
		id: "e1",
		type: "RELATED_TO",
		startNodeId: "a",
		endNodeId: "b",
		properties,
	};
}

describe("maxSharedSources", () => {
	test("is zero when nothing was derived", () => {
		expect(maxSharedSources([edge({ weight: 0.5, asserted: true })])).toBe(0);
	});

	test("finds the busiest pair", () => {
		expect(
			maxSharedSources([
				edge({ sharedSources: 2, asserted: false }),
				edge({ sharedSources: 7, asserted: false }),
				edge({ weight: 1, asserted: true }),
			]),
		).toBe(7);
	});
});

describe("relationshipStrength", () => {
	test("reads an asserted relation's own confidence", () => {
		expect(
			relationshipStrength(edge({ weight: 0.4, asserted: true }), 10),
		).toBe(0.4);
	});

	test("clamps a confidence the column does not constrain", () => {
		expect(
			relationshipStrength(edge({ weight: 2.5, asserted: true }), 10),
		).toBe(1);
		expect(relationshipStrength(edge({ weight: -1, asserted: true }), 10)).toBe(
			0,
		);
	});

	test("scales a derived edge against the busiest pair in the graph", () => {
		const relationships = [
			edge({ sharedSources: 1, asserted: false }),
			edge({ sharedSources: 4, asserted: false }),
		];
		const max = maxSharedSources(relationships);

		expect(
			relationshipStrength(relationships[0] as GraphRelationship, max),
		).toBe(0.25);
		expect(
			relationshipStrength(relationships[1] as GraphRelationship, max),
		).toBe(1);
	});

	test("treats an edge with no reading as strong, not weak", () => {
		// The slider exists to hide weak connections. Sorting "unknown" to the
		// bottom would make it disappear at the first nudge, which is a different
		// claim from the one the reader made.
		expect(relationshipStrength(edge({ asserted: true }), 10)).toBe(1);
	});
});
