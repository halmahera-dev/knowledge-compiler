"use client";

import { cn } from "@kc/ui/lib/utils";
import { Layers } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-states";
import type { GraphData, GraphSelection } from "@/features/graph";
import { GraphViewer } from "@/features/graph";
import { GraphThemes } from "@/features/graph/graph-themes";
import { useGraph } from "@/features/graph/hooks/use-graph";

/**
 * What the viewer is handed while the query is still in flight.
 *
 * A module constant, not an inline literal: a fresh object each render made
 * every memo downstream recompute and re-ran the effect that calls
 * `setGraph` + `reheat`, which schedules an animation frame, which renders,
 * which builds another fresh object. That loop is what React eventually refused
 * to keep up with ("Maximum update depth exceeded").
 */
const EMPTY_GRAPH: GraphData = { nodes: [], relationships: [] };

function describeSelection(selection: GraphSelection) {
	if (!selection) {
		return "Click a node or relationship to inspect it";
	}

	return selection.kind === "node"
		? `Node ${selection.id}`
		: `Relationship ${selection.id}`;
}

export function GraphView() {
	const [selection, setSelection] = useState<GraphSelection>(null);
	const [themesOpen, setThemesOpen] = useState(false);
	const graph = useGraph();

	// Both panels live on the right edge, and selecting a node is a deliberate
	// act — so the inspector wins while a selection stands, rather than the two
	// stacking or fighting for the same strip.
	const showThemes = themesOpen && !selection;

	return (
		<div className="relative min-h-0 flex-1">
			<PageHeader className="absolute inset-x-0 top-0 z-20" title="Graph View">
				<span className="ml-auto hidden truncate text-muted-foreground text-xs md:block">
					{graph.data
						? `${graph.data.nodes.length} nodes · ${graph.data.relationships.length} connections`
						: describeSelection(selection)}
				</span>

				<button
					type="button"
					aria-pressed={themesOpen}
					onClick={() => setThemesOpen((open) => !open)}
					className={cn(
						"ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-medium text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:ml-3",
						themesOpen
							? "border-foreground/30 bg-muted text-foreground"
							: "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
					)}
				>
					<Layers aria-hidden="true" className="size-3.5" />
					Themes
				</button>
			</PageHeader>

			{graph.isError ? (
				<div className="grid h-full place-items-center px-6">
					<QueryError error={graph.error} />
				</div>
			) : (
				<GraphViewer
					// An empty graph while loading rather than sample data: showing
					// invented nodes that then vanish is worse than showing nothing,
					// because the reader cannot tell which of the two was their own.
					data={graph.data ?? EMPTY_GRAPH}
					onSelectionChange={setSelection}
					className="[--graph-overlay-top:4.25rem]"
				/>
			)}

			{showThemes ? (
				<div className="pointer-events-none absolute top-[4.25rem] right-3 bottom-3 z-10 flex items-start justify-end">
					<GraphThemes />
				</div>
			) : null}
		</div>
	);
}
