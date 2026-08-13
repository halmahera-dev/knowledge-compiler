import type { GraphRelationship } from "./types";

/**
 * How strong a connection is, on one 0–1 scale.
 *
 * The two kinds of edge do not measure the same thing. An asserted relation
 * carries the confidence the compiler wrote down when it claimed the relation.
 * A derived one carries a count: how many captures mentioned both ends. Putting
 * them on a single slider means normalising that count against the busiest pair
 * in the graph currently on screen.
 *
 * That is a relative reading, and it is the only honest one available — two
 * shared sources means something quite different in a workspace of six pages
 * than in one of six hundred, and nothing in the data says which you have.
 */

/** The busiest co-occurrence in a graph, or 0 when there are no derived edges. */
export function maxSharedSources(
	relationships: readonly GraphRelationship[],
): number {
	let max = 0;

	for (const relationship of relationships) {
		const shared = relationship.properties.sharedSources;

		if (typeof shared === "number" && shared > max) {
			max = shared;
		}
	}

	return max;
}

export function relationshipStrength(
	relationship: GraphRelationship,
	maxShared: number,
): number {
	const weight = relationship.properties.weight;

	if (typeof weight === "number") {
		// Written as a confidence, but nothing constrains the column to 0–1, so a
		// value above 1 is clamped rather than trusted to keep the scale honest.
		return Math.min(1, Math.max(0, weight));
	}

	const shared = relationship.properties.sharedSources;

	if (typeof shared === "number" && maxShared > 0) {
		return Math.min(1, Math.max(0, shared / maxShared));
	}

	// An edge that carries neither reading sits at the top of the scale: the
	// filter is there to hide weak connections, and "unknown" is not weak.
	return 1;
}
