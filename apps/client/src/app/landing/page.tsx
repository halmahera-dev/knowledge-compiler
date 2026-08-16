import type { Metadata } from "next";
import { LandingPage } from "@/features/marketing/landing-page";

export const metadata: Metadata = {
	// Absolute, so the root template does not turn this into
	// "… · Traversa". This is the one page that gets shared before
	// anyone has an account, so the title carries the pitch rather than just the
	// product name.
	title: { absolute: "Traversa — read it once, it stays read" },
	description:
		"Save a link, a passage, or a PDF. An agent reads it once and folds what it claims into a wiki that cites every sentence.",
};

export default function Page() {
	return <LandingPage />;
}
