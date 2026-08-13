"use client";

import { Button } from "@kc/ui/components/button";
import { Compass } from "lucide-react";
import { useTour } from "@/features/tour/tour-provider";

/**
 * Starts the tour from inside a page rather than from the sidebar footer.
 *
 * Kept separate from `VisualHelpButton`, which is shaped as a sidebar menu row
 * and cannot be dropped into an empty state without looking like a stray nav
 * item.
 */
export function TourButton({ label = "Show me around" }: { label?: string }) {
	const { start } = useTour();

	return (
		<Button variant="outline" onClick={start}>
			<Compass />
			{label}
		</Button>
	);
}
