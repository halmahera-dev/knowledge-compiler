"use client";

import {
	Asteroid02Icon,
	Chart03Icon,
	ChevronDown,
	Cursor02Icon,
	NotebookText,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@kc/ui/components/collapsible";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@kc/ui/components/sidebar";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import NavUser from "@/features/user/components/nav-user";

const NOTE_COLLECTIONS = ["Research", "Reference", "Project", "Inbox"];

export function AppSidebar() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const activeCollection = searchParams.get("collection");

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
								isActive={pathname === "/" && activeCollection === null}
								render={<Link href="/" />}
							>
								<HugeiconsIcon icon={NotebookText} />
								All Notes
							</SidebarMenuButton>
						</SidebarMenuItem>

						<SidebarMenuItem>
							<SidebarMenuButton
								isActive={pathname.startsWith("/agent")}
								render={<Link href="/agent" />}
							>
								<HugeiconsIcon icon={Cursor02Icon} />
								Agent
							</SidebarMenuButton>
						</SidebarMenuItem>

						<SidebarMenuItem>
							<SidebarMenuButton
								isActive={pathname === "/graph"}
								render={<Link href="/graph" />}
							>
								<HugeiconsIcon icon={Asteroid02Icon} />
								Graph View
							</SidebarMenuButton>
						</SidebarMenuItem>

						<SidebarMenuItem>
							<SidebarMenuButton
								isActive={pathname === "/statistics"}
								render={<Link href="/statistics" />}
							>
								<HugeiconsIcon icon={Chart03Icon} />
								Statistics
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarGroupContent>
				</SidebarGroup>

				<Collapsible defaultOpen className="group/collapsible">
					<SidebarGroup>
						<SidebarGroupLabel render={<CollapsibleTrigger />}>
							Categories
							<HugeiconsIcon
								icon={ChevronDown}
								className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180"
							/>
						</SidebarGroupLabel>

						<CollapsibleContent className="translate-y-0 overflow-hidden opacity-100 transition-[opacity,transform] duration-60 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:-translate-y-[3px] data-starting-style:-translate-y-[3px] data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:duration-[140ms] data-ending-style:ease-[cubic-bezier(0.7,0,0.84,0)] motion-reduce:duration-100 motion-reduce:data-ending-style:-translate-y-px motion-reduce:data-starting-style:-translate-y-px">
							<SidebarGroupContent>
								{NOTE_COLLECTIONS.map((collection) => (
									<SidebarMenuItem key={collection}>
										<SidebarMenuButton
											isActive={
												pathname === "/" && activeCollection === collection
											}
											render={<Link href={`/?collection=${collection}`} />}
										>
											{collection}
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarGroupContent>
						</CollapsibleContent>
					</SidebarGroup>
				</Collapsible>
			</SidebarContent>
		</Sidebar>
	);
}
