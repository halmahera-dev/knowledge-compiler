/**
 * The workspace's real topic graph, in the shape the viewer draws.
 *
 * The viewer speaks a Neo4j-flavoured vocabulary — nodes carry `labels` and
 * `properties`, edges carry a `type` — while the API speaks the product's own:
 * topics and entities joined by typed relations, plus a second set of edges
 * derived from provenance. This module is the translation, and it is the only
 * place that knows both.
 */
import { request } from "@/lib/api-client";
import type { GraphData, GraphNode, GraphRelationship } from "./types";

export type EdgeRelation =
	| "extends"
	| "contradicts"
	| "prerequisite_of"
	| "example_of"
	| "related_to";

interface ApiGraphNode {
	id: string;
	label: string;
	kind: "topic" | "entity";
	weight: number;
	slug: string | null;
	community: number | null;
}

interface ApiGraphEdge {
	id: string;
	source: string;
	target: string;
	relation: EdgeRelation;
	weight: number;
}

/**
 * An edge nobody wrote down, computed from where nodes were seen.
 *
 * Kept distinct all the way to the screen. A typed relation is a claim the
 * agent made and can be wrong — which is why a compile can be reverted.
 * Co-occurrence is a statistic that cannot be wrong, only uninteresting.
 */
interface ApiDerivedEdge {
	source: string;
	target: string;
	kind: "mentions" | "co_occurs";
	sharedSources: number;
}

interface ApiGraph {
	nodes: ApiGraphNode[];
	edges: ApiGraphEdge[];
	derivedEdges: ApiDerivedEdge[];
}

/** Title case, because the label is what the viewer prints on the node. */
function labelFor(node: ApiGraphNode): string {
	return node.kind === "topic" ? "Topic" : "Concept";
}

export async function fetchGraph(): Promise<GraphData> {
	const data = await request<ApiGraph>("/api/v1/graph");

	const nodes: GraphNode[] = (data.nodes ?? []).map((node) => ({
		id: node.id,
		labels: [labelFor(node)],
		properties: {
			name: node.label,
			// `weight` is how much of the reading touches this topic; the viewer
			// sizes nodes by degree, so this is carried for the inspector rather
			// than for layout.
			sources: node.weight,
			// Null until the first detection run, and only ever a colour index —
			// the numbers are reassigned on every save.
			community: node.community,
			slug: node.slug,
		},
	}));

	const present = new Set(nodes.map((n) => n.id));

	const authored: GraphRelationship[] = (data.edges ?? [])
		.filter((e) => present.has(e.source) && present.has(e.target))
		.map((edge) => ({
			id: edge.id,
			type: edge.relation.toUpperCase(),
			startNodeId: edge.source,
			endNodeId: edge.target,
			properties: { weight: edge.weight, asserted: true },
		}));

	// Derived edges have no id of their own — they are computed per request — so
	// one is built from the pair and kind. Stable across renders, which is what
	// the viewer's keying needs.
	const derived: GraphRelationship[] = (data.derivedEdges ?? [])
		.filter((e) => present.has(e.source) && present.has(e.target))
		.map((edge) => ({
			id: `derived:${edge.kind}:${edge.source}:${edge.target}`,
			type: edge.kind.toUpperCase(),
			startNodeId: edge.source,
			endNodeId: edge.target,
			properties: { sharedSources: edge.sharedSources, asserted: false },
		}));

	return { nodes, relationships: [...authored, ...derived] };
}
