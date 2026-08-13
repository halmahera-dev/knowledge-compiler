import { GapsView } from "@/features/gaps/components/gaps-view";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gaps" };

export default function GapsPage() {
	return <GapsView />;
}
