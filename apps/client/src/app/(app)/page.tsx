import type { Metadata } from "next";
import { WikiIndex } from "@/features/wiki/components/wiki-index";

export const metadata: Metadata = { title: "All Notes" };

export default function AllNotesPage() {
	return <WikiIndex />;
}
