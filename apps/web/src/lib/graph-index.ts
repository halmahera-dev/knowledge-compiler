/**
 * The graph, linearised.
 *
 * The canvas is unreachable without a mouse and carries nothing for a screen
 * reader — and clicking a node to open its page is a real navigation path
 * (PRD §6.4), so the whole feature was mouse-only. Rather than bolting a
 * "text version" onto the side, this is the same information as an index: it is
 * easier to find a named topic in a sorted list than in a force layout, so the
 * linear form earns its place for everyone.
 *
 * Pure, so the phrasing rules below are testable — the direction of an edge is
 * exactly the sort of thing that reads correctly until someone reverses it.
 */
import type { EdgeRelation, GraphData, GraphNode } from "./api";

/** How an edge reads from each end. */
const PHRASING: Record<EdgeRelation, { out: string; in: string }> = {
  extends: { out: "extends", in: "extended by" },
  contradicts: { out: "contradicts", in: "contradicted by" },
  prerequisite_of: { out: "prerequisite of", in: "requires" },
  example_of: { out: "example of", in: "has example" },
  // Symmetric: naming it differently at each end would imply a direction the
  // relation does not have.
  related_to: { out: "related to", in: "related to" },
};

export interface Connection {
  relation: EdgeRelation;
  /** Reads correctly when placed after the node being described. */
  phrase: string;
  otherLabel: string;
  otherSlug: string | null;
}

export interface IndexedNode extends GraphNode {
  connections: Connection[];
}

/**
 * Nodes with their edges attached, heaviest first.
 *
 * Weight is how much of the reading touches a topic, which is the same thing
 * node size encodes on the canvas — so the list opens where the eye would land.
 */
export function buildIndex(graph: GraphData): IndexedNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const connections = new Map<string, Connection[]>();
  const add = (nodeId: string, connection: Connection) => {
    const list = connections.get(nodeId);
    if (list) list.push(connection);
    else connections.set(nodeId, [connection]);
  };

  for (const edge of graph.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    // An edge pointing outside the returned node set would render as a
    // connection to nothing; the API filters nodes by weight, so this happens.
    if (!source || !target) continue;

    const phrasing = PHRASING[edge.relation] ?? PHRASING.related_to;
    add(source.id, {
      relation: edge.relation,
      phrase: phrasing.out,
      otherLabel: target.label,
      otherSlug: target.slug,
    });
    add(target.id, {
      relation: edge.relation,
      phrase: phrasing.in,
      otherLabel: source.label,
      otherSlug: source.slug,
    });
  }

  return [...graph.nodes]
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
    .map((node) => ({ ...node, connections: connections.get(node.id) ?? [] }));
}
