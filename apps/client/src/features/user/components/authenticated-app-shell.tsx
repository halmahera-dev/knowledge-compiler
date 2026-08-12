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
import { getSession, listOrganizations } from "../user-queries";

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

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <AppSidebar />
      <SidebarInset className="overflow-y-auto overflow-x-hidden overscroll-contain border shadow-none">
        {children}
      </SidebarInset>
    </SidebarProvider>
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
