/**
 * The topic graph (PRD §6.4).
 *
 * react-force-graph-2d (MIT) rather than Cosmograph, which is CC-BY-NC and so
 * cannot ship in a commercial product.
 *
 * Rendered client-side only: the library reaches for `window` and canvas at
 * import time, so it is loaded lazily after mount rather than during SSR.
 */
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, type EdgeRelation, type GraphData } from "~/lib/api";
import { titleHead } from "~/lib/head";
import { requireSession } from "~/lib/guards";
import { buildIndex } from "~/lib/graph-index";

export const Route = createFileRoute("/graph")({
  beforeLoad: requireSession,
  head: titleHead("Graph"),
  component: GraphPage,
  loader: async () => {
    try {
      return { graph: await api.getGraph() };
    } catch {
      return { graph: { nodes: [], edges: [], derivedEdges: [] } as GraphData };
    }
  },
});

/**
 * Colours for the clusters Louvain finds.
 *
 * Eight, cycled. More would be indistinguishable at node size, and a workspace
 * with more than eight clusters is better read by hovering than by hue. Cluster
 * membership is also carried by position and by the index below, so colour is
 * never the only way to tell two groups apart.
 */
const COMMUNITY_COLOURS = [
  "#2563eb",
  "#2f855a",
  "#b45309",
  "#7c3aed",
  "#0e7490",
  "#be123c",
  "#4d7c0f",
  "#a16207",
];

function communityColour(community: number | null | undefined): string | null {
  if (community === null || community === undefined) return null;
  return COMMUNITY_COLOURS[community % COMMUNITY_COLOURS.length]!;
}

/** Edge colours read off the CSS custom properties so both themes work. */
const RELATION_TOKEN: Record<EdgeRelation, string> = {
  extends: "--color-added",
  contradicts: "--color-disputed",
  prerequisite_of: "--color-link",
  example_of: "--color-merged",
  related_to: "--color-rule-strong",
};

const RELATION_LABEL: Record<EdgeRelation, string> = {
  extends: "extends",
  contradicts: "contradicts",
  prerequisite_of: "prerequisite of",
  example_of: "example of",
  related_to: "related",
};

function cssValue(token: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback
  );
}

function GraphPage() {
  const { graph } = Route.useLoaderData();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [ForceGraph, setForceGraph] = useState<React.ComponentType<
    Record<string, unknown>
  > | null>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Deferred import: the library touches window/canvas on load, so it must not
    // run during server rendering.
    import("react-force-graph-2d").then((module) => {
      if (!cancelled) {
        setForceGraph(() => module.default as React.ComponentType<Record<string, unknown>>);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const measure = (width: number) =>
      setSize({
        width,
        height: Math.max(440, Math.min(720, window.innerHeight - 260)),
      });

    // Measured immediately, not only from the observer. The initial 800px is a
    // guess that is more than twice the container on a phone, and the observer's
    // first callback is asynchronous — so without this the canvas renders once at
    // the wrong width, and stays wrong entirely if ResizeObserver never delivers.
    measure(element.clientWidth);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ForceGraph]);

  // react-force-graph mutates the objects it is given (adding x/y/vx/vy), so it
  // gets copies — passing loader data directly would corrupt the router cache.
  const data = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => ({ ...n })),
      links: [
        ...graph.edges.map((e) => ({ ...e, derived: false as const })),
        // Drawn on the same canvas but never mistakable for an authored edge.
        // The layout needs them — they are the only thing holding separate saves
        // together — but a reader has to be able to tell what the agent asserted
        // from what was merely counted.
        ...graph.derivedEdges.map((e) => ({ ...e, derived: true as const })),
      ],
    }),
    [graph],
  );

  const indexed = useMemo(() => buildIndex(graph), [graph]);

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div>
          <p className="eyebrow">Topics and connections</p>
          <h1 className="mt-2 font-read text-h1 font-semibold tracking-[-0.02em]">
            Graph
          </h1>
        </div>
        <p className="font-mono text-micro tabular-nums text-ink-faint">
          {graph.nodes.length} nodes · {graph.edges.length} edges
        </p>
      </header>

      {/* Legend: relation type is carried by colour, so it needs a key. */}
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
        {(Object.keys(RELATION_LABEL) as EdgeRelation[]).map((relation) => (
          <li key={relation} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-0.5 w-6 rounded-full"
              style={{ background: `var(${RELATION_TOKEN[relation]})` }}
            />
            <span className="font-mono text-micro text-ink-muted">
              {RELATION_LABEL[relation]}
            </span>
          </li>
        ))}
      </ul>

      <div
        ref={containerRef}
        // The index below carries the same content in a form that can be read
        // and operated; announcing the canvas as well would duplicate all of it.
        aria-hidden="true"
        className="paper-grain mt-5 overflow-hidden rounded-lg border border-rule bg-surface"
      >
        {graph.nodes.length === 0 ? (
          <div className="grid h-[440px] place-items-center px-6 text-center">
            <div>
              <p className="font-read text-lead text-ink-muted">
                The graph is empty.
              </p>
              <p className="mt-2 text-small text-ink-faint">
                Clusters appear once a few related things are saved.
              </p>
            </div>
          </div>
        ) : !ForceGraph ? (
          <div className="grid h-[440px] place-items-center">
            <p className="eyebrow">loading graph…</p>
          </div>
        ) : (
          <ForceGraph
            graphData={data}
            width={size.width}
            height={size.height}
            backgroundColor="transparent"
            nodeRelSize={5}
            // Radius tracks weight — how much saved content touches a topic —
            // sublinearly, so one dominant node cannot swamp the canvas.
            nodeVal={(node: { weight?: number }) => Math.max(1, Math.sqrt(node.weight ?? 1) * 2)}
            nodeLabel={(node: { label?: string; weight?: number }) =>
              `${node.label} · ${node.weight} source${node.weight === 1 ? "" : "s"}`
            }
            nodeColor={(node: { id?: string; kind?: string; community?: number | null }) => {
              if (node.id === hovered) return cssValue("--color-link", "#2563eb");
              // Cluster first, when there is one. Before the first detection run
              // every community is null, and this falls back to the old
              // topic/entity distinction rather than colouring everything alike.
              const byCommunity = communityColour(node.community);
              if (byCommunity) return byCommunity;
              return node.kind === "topic"
                ? cssValue("--color-ink", "#1a1815")
                : cssValue("--color-ink-faint", "#8a8580");
            }}
            linkColor={(link: { relation?: EdgeRelation; derived?: boolean }) =>
              link.derived
                ? cssValue("--color-rule", "#e5e1d8")
                : cssValue(RELATION_TOKEN[link.relation ?? "related_to"], "#ccc")
            }
            linkWidth={(link: { weight?: number; derived?: boolean }) =>
              link.derived ? 0.4 : 0.6 + (link.weight ?? 0.5)
            }
            linkLineDash={(link: { derived?: boolean }) => (link.derived ? [2, 3] : null)}
            linkLabel={(link: {
              derived?: boolean;
              kind?: string;
              sharedSources?: number;
              relation?: EdgeRelation;
            }) =>
              link.derived
                ? `${link.kind === "mentions" ? "appears on" : "appears together in"} ${link.sharedSources} capture${link.sharedSources === 1 ? "" : "s"}`
                : (link.relation ?? "related to")
            }
            // Only authored edges are directional. Co-occurrence has no direction
            // to claim, and an arrow would invent one.
            linkDirectionalArrowLength={(link: { derived?: boolean }) => (link.derived ? 0 : 3)}
            linkDirectionalArrowRelPos={1}
            onNodeHover={(node: { id?: string } | null) => setHovered(node?.id ?? null)}
            onNodeClick={(node: { slug?: string | null }) => {
              // Clicking a node opens its page (PRD §6.4). Concept nodes with no
              // page of their own are not navigable.
              if (node.slug) {
                router.navigate({ to: "/wiki/$slug", params: { slug: node.slug } });
              }
            }}
            cooldownTicks={120}
          />
        )}
      </div>

      <p className="mt-3 text-micro text-ink-faint">
        Node size tracks how much of your reading touches a topic.
      </p>

      {indexed.length > 0 && (
        <section aria-labelledby="topics-heading" className="mt-12 border-t border-rule pt-8">
          <h2 id="topics-heading" className="eyebrow">
            Every topic and what it connects to
          </h2>
          {/* Was followed by two clauses justifying the list's own existence to
              the reader. The app explaining why it made a choice is the app
              talking about itself. */}
          <p className="mt-2 max-w-[60ch] text-small leading-relaxed text-ink-muted">
            Heaviest first.
          </p>

          <ul className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {indexed.map((node) => (
              <li key={node.id} className="border-l border-rule pl-4">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  {node.slug ? (
                    <Link
                      to="/wiki/$slug"
                      params={{ slug: node.slug }}
                      className="font-read text-body font-semibold text-link hover:text-link-hover"
                    >
                      {node.label}
                    </Link>
                  ) : (
                    <span className="font-read text-body font-semibold">{node.label}</span>
                  )}
                  <span className="font-mono text-micro text-ink-faint">
                    {node.weight} source{node.weight === 1 ? "" : "s"}
                  </span>
                </p>

                {node.connections.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {node.connections.map((connection, i) => (
                      <li
                        key={`${connection.phrase}-${connection.otherLabel}-${i}`}
                        className="text-small leading-relaxed text-ink-muted"
                      >
                        <span
                          className={
                            connection.relation === "contradicts"
                              ? "font-mono text-micro uppercase tracking-wider text-disputed"
                              : "font-mono text-micro uppercase tracking-wider text-ink-faint"
                          }
                        >
                          {connection.phrase}
                        </span>{" "}
                        {connection.otherSlug ? (
                          <Link
                            to="/wiki/$slug"
                            params={{ slug: connection.otherSlug }}
                            className="text-link hover:text-link-hover"
                          >
                            {connection.otherLabel}
                          </Link>
                        ) : (
                          connection.otherLabel
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-small text-ink-faint">No connections yet.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
