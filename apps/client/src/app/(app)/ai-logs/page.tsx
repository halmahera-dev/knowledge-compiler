import { UsageView } from "@/features/usage/components/usage-view";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "AI Logs" };

export default function AiLogsPage() {
	return <UsageView />;
}
