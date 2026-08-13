"use client";

import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@kc/ui/components/sidebar";
import { Compass } from "lucide-react";
import { useTour } from "@/features/tour/tour-provider";

/**
 * The control that starts the tour.
 *
 * In the sidebar footer rather than a header, because this app has no header —
 * and at the bottom because it is the thing you reach for after the obvious
 * ones, not before them.
 */
export function VisualHelpButton() {
	const { start } = useTour();

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton
					onClick={start}
					tooltip="Guided tour of the interface"
				>
					<Compass />
					Visual help
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
