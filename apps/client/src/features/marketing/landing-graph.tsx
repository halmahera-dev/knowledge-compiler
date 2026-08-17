"use client";

import type { GraphData } from "@/features/graph";
import { GraphViewer } from "@/features/graph";

/**
 * Hardcoded mock graph for the landing page. Same visual language as the real
 * thing — community-coloured nodes, curved arcs, force-directed layout — but
 * with sleep-research topics instead of quantisation jargon.
 */

const MOCK_DATA: GraphData = {
	nodes: [
		{
			id: "n1",
			labels: ["Topic"],
			properties: {
				name: "Sleep duration",
				community: 0,
			},
		},
		{
			id: "n2",
			labels: ["Topic"],
			properties: {
				name: "Chronotype",
				community: 1,
			},
		},
		{
			id: "n3",
			labels: ["Concept"],
			properties: {
				name: "Mortality risk",
				community: 2,
			},
		},
		{
			id: "n4",
			labels: ["Topic"],
			properties: {
				name: "Working memory",
				community: 3,
			},
		},
		{
			id: "n5",
			labels: ["Concept"],
			properties: {
				name: "Sleep quality",
				community: 0,
			},
		},
		{
			id: "n6",
			labels: ["Concept"],
			properties: {
				name: "Circadian rhythm",
				community: 1,
			},
		},
	],
	relationships: [
		{
			id: "r1",
			type: "RELATED_TO",
			startNodeId: "n1",
			endNodeId: "n3",
			properties: { confidence: 0.9 },
		},
		{
			id: "r2",
			type: "PREREQUISITE_OF",
			startNodeId: "n1",
			endNodeId: "n2",
			properties: { confidence: 0.7 },
		},
		{
			id: "r3",
			type: "RELATED_TO",
			startNodeId: "n2",
			endNodeId: "n4",
			properties: { confidence: 0.8 },
		},
		{
			id: "r4",
			type: "EXTENDS",
			startNodeId: "n2",
			endNodeId: "n6",
			properties: { confidence: 0.85 },
		},
		{
			id: "r5",
			type: "RELATED_TO",
			startNodeId: "n5",
			endNodeId: "n1",
			properties: { confidence: 0.75 },
		},
		{
			id: "r6",
			type: "CONTRADICTS",
			startNodeId: "n4",
			endNodeId: "n1",
			properties: { confidence: 0.6 },
		},
	],
};

export function LandingGraph() {
	return (
		<div className="h-[400px] w-full">
			<GraphViewer data={MOCK_DATA} />
		</div>
	);
}
