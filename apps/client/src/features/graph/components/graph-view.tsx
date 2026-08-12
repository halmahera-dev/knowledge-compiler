"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import type { GraphSelection } from "@/features/graph";
import { GraphViewer, SAMPLE_GRAPH } from "@/features/graph";

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

	return (
		<div className="relative min-h-0 flex-1">
			<PageHeader className="absolute inset-x-0 top-0" title="Graph View">
				<span className="ml-auto hidden truncate text-muted-foreground text-xs md:block">
					{describeSelection(selection)} · scroll to zoom · double-click a node
					to expand
				</span>
			</PageHeader>

			<GraphViewer
				data={SAMPLE_GRAPH}
				onSelectionChange={setSelection}
				className="[--graph-overlay-top:4.25rem]"
			/>
		</div>
	);
}
