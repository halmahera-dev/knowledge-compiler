/**
 * Linearising the graph.
 *
 * The risk here is direction. "A extends B" and "B extends A" are both plausible
 * sentences, so a reversed edge produces a page that reads perfectly and states
 * the opposite of what was compiled — the one class of bug in this file that no
 * amount of looking at it would catch.
 */
import { describe, expect, it } from "vitest";

import type { GraphData } from "./api";
import { buildIndex } from "./graph-index";

const A = { id: "a", label: "Quantisation", kind: "topic" as const, weight: 5, slug: "quantisation", community: null };
const B = { id: "b", label: "Outlier channels", kind: "topic" as const, weight: 3, slug: "outliers", community: null };
const C = { id: "c", label: "Entity", kind: "entity" as const, weight: 1, slug: null, community: null };

function graph(over: Partial<GraphData> = {}): GraphData {
  // Built field by field rather than spread over a Partial: spreading makes
  // every property optional, so the helper's return type stops matching GraphData.
  return {
    nodes: over.nodes ?? [A, B, C],
    edges: over.edges ?? [],
    derivedEdges: over.derivedEdges ?? [],
  };
}

const find = (index: ReturnType<typeof buildIndex>, id: string) =>
  index.find((n) => n.id === id)!;

describe("buildIndex", () => {
  it("orders by weight so the list opens where the eye would land", () => {
    expect(buildIndex(graph()).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks weight ties by label, so the order is stable between renders", () => {
    const tied = graph({
      nodes: [
        { ...A, id: "x", label: "Zeta", weight: 2 },
        { ...A, id: "y", label: "Alpha", weight: 2 },
      ],
    });
    expect(buildIndex(tied).map((n) => n.label)).toEqual(["Alpha", "Zeta"]);
  });

  describe("edge direction", () => {
    const extended = graph({
      edges: [{ id: "e", source: "a", target: "b", relation: "extends", weight: 1 }],
    });

    it("reads actively from the source", () => {
      const [connection] = find(buildIndex(extended), "a").connections;
      expect(connection).toMatchObject({ phrase: "extends", otherLabel: "Outlier channels" });
    });

    it("reads passively from the target — not the same sentence reversed", () => {
      const [connection] = find(buildIndex(extended), "b").connections;
      expect(connection).toMatchObject({ phrase: "extended by", otherLabel: "Quantisation" });
    });

    it("inverts prerequisite_of rather than repeating it", () => {
      const g = graph({
        edges: [{ id: "e", source: "a", target: "b", relation: "prerequisite_of", weight: 1 }],
      });
      expect(find(buildIndex(g), "a").connections[0]!.phrase).toBe("prerequisite of");
      expect(find(buildIndex(g), "b").connections[0]!.phrase).toBe("requires");
    });

    it("keeps a symmetric relation symmetric", () => {
      // Naming the ends differently would imply a direction it does not have.
      const g = graph({
        edges: [{ id: "e", source: "a", target: "b", relation: "related_to", weight: 1 }],
      });
      expect(find(buildIndex(g), "a").connections[0]!.phrase).toBe("related to");
      expect(find(buildIndex(g), "b").connections[0]!.phrase).toBe("related to");
    });
  });

  it("carries the other end's slug so the connection is followable", () => {
    const g = graph({
      edges: [{ id: "e", source: "a", target: "b", relation: "extends", weight: 1 }],
    });
    expect(find(buildIndex(g), "a").connections[0]!.otherSlug).toBe("outliers");
  });

  it("leaves the slug null for a node with no page of its own", () => {
    const g = graph({
      edges: [{ id: "e", source: "a", target: "c", relation: "extends", weight: 1 }],
    });
    expect(find(buildIndex(g), "a").connections[0]!.otherSlug).toBeNull();
  });

  it("drops an edge whose other end was filtered out of the node set", () => {
    // The API filters nodes by weight, so dangling edges genuinely arrive.
    const g = graph({
      edges: [{ id: "e", source: "a", target: "missing", relation: "extends", weight: 1 }],
    });
    expect(find(buildIndex(g), "a").connections).toEqual([]);
  });

  it("gives every node a connections array, including isolated ones", () => {
    for (const node of buildIndex(graph())) {
      expect(Array.isArray(node.connections)).toBe(true);
    }
  });

  it("lists both edges when two nodes are connected twice", () => {
    const g = graph({
      edges: [
        { id: "e1", source: "a", target: "b", relation: "extends", weight: 1 },
        { id: "e2", source: "a", target: "b", relation: "contradicts", weight: 1 },
      ],
    });
    expect(find(buildIndex(g), "a").connections.map((c) => c.phrase)).toEqual([
      "extends",
      "contradicts",
    ]);
  });

  it("returns an empty index for an empty graph", () => {
    expect(buildIndex({ nodes: [], edges: [], derivedEdges: [] })).toEqual([]);
  });
});
