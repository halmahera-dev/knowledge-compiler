"use client";

import {
	Asteroid02Icon,
	Coins01Icon,
	Cursor02Icon,
	HelpCircleIcon,
	JusticeScale01Icon,
	NotebookText,
	Pulse01Icon,
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
const APP_ROUTES = new Set([
	"agent",
	"activity",
	"graph",
	"gaps",
	"disputes",
	"ai-logs",
	"settings",
	// No route serves this any more — saving moved into the conversation — but a
	// page may still hold the slug, claimed back when there was a page here.
	// Dropping it would make that page the active "All Notes" destination.
	"capture",
]);

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
								data-tour="nav-wiki"
								isActive={onNotes}
								render={<Link href="/" />}
							>
								<HugeiconsIcon icon={NotebookText} />
								Wiki
							</SidebarMenuButton>
						</SidebarMenuItem>

						<SidebarMenuItem>
							<SidebarMenuButton
								data-tour="nav-activity"
								isActive={pathname === "/activity"}
								render={<Link href="/activity" />}
							>
								<HugeiconsIcon icon={Pulse01Icon} />
								Activity
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
								data-tour="nav-disputes"
								isActive={pathname === "/disputes"}
								render={<Link href="/disputes" />}
							>
								<HugeiconsIcon icon={JusticeScale01Icon} />
								Contradictions
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
