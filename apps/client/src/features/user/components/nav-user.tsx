"use client";

import {
  ArrowUpDownIcon,
  LogoutSquare02Icon,
  Monitor,
  MoonFastWindIcon,
  MoreVerticalCircle01Icon,
  PaintBoardIcon,
  PlusSignIcon,
  Sun03Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@kc/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@kc/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@kc/ui/components/sidebar";
import { Skeleton } from "@kc/ui/components/skeleton";
import { Spinner } from "@kc/ui/components/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";
import { authClient } from "../user-client";
import { clearApiToken } from "../user-token";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function NavUser() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { isMobile, setOpenMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const { data: organizations, isPending: isListPending } =
    authClient.useListOrganizations();
  const { data: activeOrganization, isPending: isActivePending } =
    authClient.useActiveOrganization();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const userName = session?.user.name ?? "Account";
  const workspaceName = activeOrganization?.name ?? "Select workspace";
  const isPending = isSessionPending || isListPending || isActivePending;

  async function switchWorkspace(organizationId: string) {
    if (organizationId === activeOrganization?.id || switchingId) {
      return;
    }

    setSwitchingId(organizationId);

    const { error } = await authClient.organization.setActive({
      organizationId,
    });

    if (error) {
      toast.error(error.message ?? "Could not switch workspace");
      setSwitchingId(null);
      return;
    }

    // The cached JWT still names the workspace being left, and it is good for
    // another ~14 minutes. `queryClient.clear()` empties React Query, not the
    // token module — without this the next request reads the old workspace.
    clearApiToken();
    queryClient.clear();

    if (isMobile) {
      setOpenMobile(false);
    }

    router.push("/");
    router.refresh();
    setSwitchingId(null);
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem className="mt-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            data-tour="workspace"
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={workspaceName}
                disabled={isPending || Boolean(switchingId)}
              />
            }
          >
            {isPending ? (
              <>
                <Skeleton className="size-8 rounded-full" />

                <div className="grid flex-1 gap-1 text-left text-sm leading-tight">
                  <Skeleton className="h-3 w-24 rounded-full" />
                  <Skeleton className="h-3 w-32 rounded-full" />
                </div>
              </>
            ) : (
              <>
                <Avatar>
                  {/* Only a real uploaded image is shown. The fallback used to
                      be a dicebear URL with a fixed seed, so every user without
                      one wore the same face — and it cost a request to a third
                      party to say nothing. AvatarFallback already has initials. */}
                  {session?.user.image ? (
                    <AvatarImage src={session.user.image} alt={userName} />
                  ) : null}
                  <AvatarFallback>{getInitials(userName)}</AvatarFallback>
                </Avatar>

                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate text-muted-foreground text-xs">
                    {userName}
                  </span>

                  <span className="truncate text-sm leading-tight">
                    {workspaceName}
                  </span>
                </div>

                <HugeiconsIcon
                  icon={MoreVerticalCircle01Icon}
                  className="ml-auto"
                />
              </>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="min-w-64"
            side={isMobile ? "bottom" : "right"}
            align="start"
          >
            <DropdownMenuGroup>
              {/* "Account" and "Settings" lived here with no handlers. A menu
                  item that does nothing when clicked reads as broken, not as
                  coming soon — they are gone until there is something to open. */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon icon={PaintBoardIcon} />
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={theme}
                        onValueChange={setTheme}
                      >
                        <DropdownMenuRadioItem value="light">
                          <HugeiconsIcon icon={Sun03Icon} />
                          Light
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dark">
                          <HugeiconsIcon icon={MoonFastWindIcon} />
                          Dark
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="system">
                          <HugeiconsIcon icon={Monitor} />
                          System
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon icon={ArrowUpDownIcon} />
                  Switch Workspace
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="min-w-56">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                      {organizations?.length ? (
                        organizations.map((organization) => (
                          <DropdownMenuItem
                            key={organization.id}
                            disabled={Boolean(switchingId)}
                            onClick={() =>
                              void switchWorkspace(organization.id)
                            }
                          >
                            <Avatar size="sm">
                              <AvatarImage
                                src={`https://api.dicebear.com/9.x/glass/svg?seed=${organization.name}`}
                                alt={organization.name}
                              />
                              <AvatarFallback>
                                {getInitials(organization.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 flex-1 truncate">
                              {organization.name}
                            </span>
                            {switchingId === organization.id ? (
                              <Spinner />
                            ) : organization.id === activeOrganization?.id ? (
                              <HugeiconsIcon icon={Tick02Icon} />
                            ) : null}
                          </DropdownMenuItem>
                        ))
                      ) : (
                        <DropdownMenuItem disabled>
                          No workspaces available
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>

                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      {/* The only way into the create form from the signed-in
                          UI. It navigates rather than taking a name inline: the
                          page's form already clears the token and the query
                          cache in the order the API expects, and typing into a
                          text field inside role="menu" fights the menu's own
                          typeahead and arrow-key handling. */}
                      <DropdownMenuItem
                        disabled={Boolean(switchingId)}
                        onClick={() => {
                          if (isMobile) {
                            setOpenMobile(false);
                          }

                          router.push("/workspace/new");
                        }}
                      >
                        <HugeiconsIcon icon={PlusSignIcon} />
                        New workspace
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={async () => {
                  const { error } = await authClient.signOut();

                  if (error) {
                    toast.error(error.message ?? "Could not log out");
                    return;
                  }

                  // The token outlives the session it was minted from, so the
                  // next sign-in would otherwise make its first request as the
                  // person who just left.
                  clearApiToken();
                  queryClient.clear();
                  // The landing page, not the sign-in form: someone who just
                  // left is not necessarily coming straight back, and a login
                  // box is a dead end for anyone who is done.
                  router.push("/landing");
                  router.refresh();
                }}
              >
                <HugeiconsIcon icon={LogoutSquare02Icon} />
                Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
