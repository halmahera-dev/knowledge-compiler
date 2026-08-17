import type { Metadata } from "next";
import { LandingPage } from "@/features/marketing/landing-page";

export const metadata: Metadata = {
	title: { absolute: "Traversa — read it once, it stays read" },
	description:
		"Save a link, a passage, or a PDF. An agent reads it once and folds what it claims into a wiki that cites every sentence.",
};

export default function Page() {
	return <LandingPage />;
}
