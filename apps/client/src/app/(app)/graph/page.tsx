import { GraphView } from "@/features/graph/components/graph-view";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Graph" };

export default function GraphPage() {
	return <GraphView />;
}
