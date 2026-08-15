import type { Metadata } from "next";
import { DisputesView } from "@/features/disputes/components/disputes-view";

export const metadata: Metadata = { title: "Contradictions" };

export default function DisputesPage() {
	return <DisputesView />;
}
