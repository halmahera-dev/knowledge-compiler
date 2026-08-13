import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
} from "@kc/ui/components/sidebar";
import { Skeleton } from "@kc/ui/components/skeleton";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { TourProvider } from "@/features/tour/tour-provider";
import {
	activeOrganizationId,
	getSession,
	listOrganizations,
} from "../user-queries";
import { WorkspaceRepair } from "./workspace-repair";

export async function AuthenticatedAppShell({
	children,
}: {
	children: ReactNode;
}) {
	const session = await getSession();
	if (!session) {
		redirect("/login");
	}

	const organizations = await listOrganizations();
	if (organizations.length === 0) {
		redirect("/workspace/new");
	}

	// Belonging to a workspace is not the same as having one selected, and only
	// the selected one reaches the API: it travels inside the token, and a token
	// without it makes every scoped endpoint answer 409. Sessions minted before
	// `databaseHooks.session.create.before` existed carry none.
	//
	// The repair runs in a Server Action rather than here — it sets a cookie, and
	// a Server Component may not.
	const needsWorkspace = !(await activeOrganizationId());

	return (
		// The tour wraps the whole shell so the sidebar's button and any page can
		// start it, and so the overlay is mounted outside SidebarInset's scroll
		// container.
		<TourProvider>
			<SidebarProvider className="h-svh min-h-0 overflow-hidden">
				<AppSidebar />
				<SidebarInset className="overflow-y-auto overflow-x-hidden overscroll-contain border shadow-none">
					{needsWorkspace ? <WorkspaceRepair /> : null}
					{children}
				</SidebarInset>
			</SidebarProvider>
		</TourProvider>
	);
}

export function AuthenticatedAppShellSkeleton() {
	return (
		<SidebarProvider className="h-svh min-h-0 overflow-hidden">
			<Sidebar variant="inset">
				<SidebarHeader>
					<Skeleton className="h-12 w-full rounded-xl" />
				</SidebarHeader>
				<SidebarContent className="space-y-3 p-2">
					{Array.from({ length: 4 }, (_, index) => (
						<Skeleton className="h-9 w-full rounded-lg" key={index} />
					))}
				</SidebarContent>
			</Sidebar>
			<SidebarInset className="min-h-0 overflow-hidden border shadow-none">
				<Skeleton className="m-4 h-10 w-40 rounded-lg" />
				<div className="grid gap-4 p-4 md:grid-cols-2">
					<Skeleton className="h-40 rounded-xl" />
					<Skeleton className="h-40 rounded-xl" />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
