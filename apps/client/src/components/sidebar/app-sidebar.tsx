"use client";

import {
	Asteroid02Icon,
	Coins01Icon,
	Cursor02Icon,
	FilePlusIcon,
	HelpCircleIcon,
	NotebookText,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@kc/ui/components/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { VisualHelpButton } from "@/features/tour/visual-help-button";
import NavUser from "@/features/user/components/nav-user";

/**
 * Top-level paths this app serves itself.
 *
 * Compiled pages live at `/{slug}`, so anything that is not one of these is a
 * page — which is what tells "All Notes" whether it is the active destination.
 * Kept in step with `RESERVED_SLUGS` in apps/api/app/services/compile.py, which
 * stops a page from ever taking one of these slugs in the first place.
 */
const APP_ROUTES = new Set(["capture", "agent", "graph", "gaps", "ai-logs"]);

export function AppSidebar() {
	const pathname = usePathname();
	const section = pathname.split("/")[1] ?? "";
	// A compiled page is "All Notes" too — it is what the index links to.
	const onNotes = !APP_ROUTES.has(section);

	return (
		<Sidebar variant="inset">
			<SidebarHeader>
				<NavUser />
			</SidebarHeader>
			<SidebarContent className="scroll-fade-y">
				<SidebarGroup>
					<SidebarGroupContent className="flex flex-col gap-1">
						<SidebarMenuItem>
							<SidebarMenuButton
								data-tour="nav-notes"
								isActive={onNotes}
								render={<Link href="/" />}
							>
								<HugeiconsIcon icon={NotebookText} />
								All Notes
							</SidebarMenuButton>
						</SidebarMenuItem>

						<SidebarMenuItem>
							<SidebarMenuButton
								data-tour="nav-capture"
								isActive={pathname === "/capture"}
								render={<Link href="/capture" />}
							>
								<HugeiconsIcon icon={FilePlusIcon} />
								Capture
							</SidebarMenuButton>
						</SidebarMenuItem>

						<SidebarMenuItem>
							<SidebarMenuButton
								data-tour="nav-agent"
								isActive={pathname.startsWith("/agent")}
								render={<Link href="/agent" />}
							>
								<HugeiconsIcon icon={Cursor02Icon} />
								Agent
							</SidebarMenuButton>
						</SidebarMenuItem>

						<SidebarMenuItem>
							<SidebarMenuButton
								data-tour="nav-graph"
								isActive={pathname === "/graph"}
								render={<Link href="/graph" />}
							>
								<HugeiconsIcon icon={Asteroid02Icon} />
								Graph View
							</SidebarMenuButton>
						</SidebarMenuItem>

						<SidebarMenuItem>
							<SidebarMenuButton
								data-tour="nav-gaps"
								isActive={pathname === "/gaps"}
								render={<Link href="/gaps" />}
							>
								<HugeiconsIcon icon={HelpCircleIcon} />
								Gaps
							</SidebarMenuButton>
						</SidebarMenuItem>

						<SidebarMenuItem>
							<SidebarMenuButton
								data-tour="nav-ai-logs"
								isActive={pathname === "/ai-logs"}
								render={<Link href="/ai-logs" />}
							>
								<HugeiconsIcon icon={Coins01Icon} />
								AI Logs
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<VisualHelpButton />
			</SidebarFooter>
		</Sidebar>
	);
}
