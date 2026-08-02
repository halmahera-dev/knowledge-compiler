/**
 * Workspace switcher and account menu.
 *
 * Switching a workspace changes the active organization on the session, which
 * changes the `workspaceId` claim in the next minted token — the URL never
 * carries it. That is deliberate: if the workspace came from the URL the API
 * would have to accept it as a parameter, and a parameter can be tampered with.
 */
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { authClient, useListOrganizations, useSession } from "~/lib/auth-client";
import { clearToken } from "~/lib/token";

/**
 * Slugs are unique across every account, so two people both naming a workspace
 * "Research" would collide. A short random suffix avoids handing that failure to
 * the reader, who cannot see the other account's names and could not fix it.
 */
function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "workspace";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export function WorkspaceMenu() {
  const { data: session, isPending } = useSession();
  const { data: workspaces } = useListOrganizations();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const newNameRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Close on outside click and on Escape — a panel that only closes by clicking
  // its own trigger feels broken.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Focus is inside the panel that is about to unmount. Without handing it
      // back, dismissing with Escape drops a keyboard user at the top of the
      // document and they have to Tab all the way back to where they were.
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (isPending) {
    return <span className="eyebrow px-3">…</span>;
  }

  if (!session) {
    return (
      <Link
        to="/signin"
        search={{ redirect: "/capture", mode: "signin" }}
        className="flex h-11 cursor-pointer items-center rounded-md bg-ink px-4 text-small font-medium text-paper transition-opacity duration-fast hover:opacity-90"
      >
        Sign in
      </Link>
    );
  }

  const active = workspaces?.find((w) => w.id === session.session.activeOrganizationId);

  async function switchTo(organizationId: string) {
    setSwitching(true);
    try {
      await authClient.organization.setActive({ organizationId });
      // The cached token still names the old workspace; keeping it would make
      // the next request read the workspace we just navigated away from.
      clearToken();
      setOpen(false);
      await router.invalidate();
    } finally {
      setSwitching(false);
    }
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || switching) return;

    setSwitching(true);
    setCreateError(null);
    try {
      const created = await authClient.organization.create({ name, slug: slugify(name) });
      if (created.error) throw new Error(created.error.message ?? "Could not create it.");
      // Creating without switching would leave the reader looking at the old
      // workspace while believing they are in the new one.
      if (created.data?.id) await authClient.organization.setActive({ organizationId: created.data.id });
      clearToken();
      setNewName("");
      setCreating(false);
      setOpen(false);
      await router.invalidate();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create it.");
    } finally {
      setSwitching(false);
    }
  }

  async function signOut() {
    clearToken();
    await authClient.signOut();
    // Out of the app entirely, so the landing page rather than the sign-in form.
    await router.navigate({ to: "/" });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // A disclosure, not a menu. The panel holds a text input for naming a
        // new workspace, and `role="menu"` may only contain menuitems — a
        // textbox inside one is not exposed as a textbox. Announcing it as a
        // menu would also promise arrow-key navigation that does not exist;
        // as a disclosure, Tab walks the panel correctly with no extra wiring.
        ref={triggerRef}
        data-tour="workspace"
        aria-expanded={open}
        // Only while the panel exists: the closed state renders nothing, and an
        // `aria-controls` pointing at an absent id is a broken reference.
        aria-controls={open ? "workspace-panel" : undefined}
        className="flex h-11 max-w-[13rem] cursor-pointer items-center gap-2 rounded-md px-3 text-small transition-colors duration-fast hover:bg-sunken"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-ink font-mono text-micro text-paper">
          {(active?.name ?? session.user.name ?? "?").charAt(0).toUpperCase()}
        </span>
        {/* Below `sm` the initial carries it. This control was 174px wide — the
            single largest item in a header that did not fit a phone — and the
            name is one tap away in the panel. Kept in the accessible name so the
            button never announces as just a letter. */}
        <span className="sr-only sm:hidden">{active?.name ?? "No workspace"}</span>
        <span className="hidden truncate sm:inline">{active?.name ?? "No workspace"}</span>
        <span aria-hidden="true" className="hidden text-ink-faint sm:inline">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          id="workspace-panel"
          aria-label="Workspaces and account"
          className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-rule bg-surface shadow-lg"
        >
          <div className="border-b border-rule px-3 py-2.5">
            <p className="truncate text-small font-medium">{session.user.name}</p>
            <p className="truncate text-micro text-ink-faint">{session.user.email}</p>
          </div>

          <div className="py-1">
            <p className="eyebrow px-3 py-1.5">Workspaces</p>
            {(workspaces ?? []).map((workspace) => {
              const isActive = workspace.id === session.session.activeOrganizationId;
              return (
                <button
                  key={workspace.id}
                  type="button"
                  disabled={switching || isActive}
                  onClick={() => switchTo(workspace.id)}
                  className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-small transition-colors duration-fast hover:bg-sunken disabled:cursor-default ${
                    isActive ? "font-medium text-ink" : "text-ink-muted"
                  }`}
                >
                  <span className="w-3 text-added">{isActive ? "✓" : ""}</span>
                  <span className="truncate">{workspace.name}</span>
                </button>
              );
            })}
            {(workspaces ?? []).length === 0 && (
              <p className="px-3 py-2 text-small text-ink-faint">None yet.</p>
            )}

            {creating ? (
              <form onSubmit={createWorkspace} className="px-3 pb-2 pt-1.5">
                <label htmlFor="new-workspace" className="sr-only">
                  Workspace name
                </label>
                <input
                  id="new-workspace"
                  ref={newNameRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setCreating(false);
                      setCreateError(null);
                    }
                  }}
                  placeholder="Reading list, Thesis…"
                  maxLength={60}
                  className="w-full rounded-sm border border-rule bg-paper px-2 py-1.5 text-small transition-colors duration-fast placeholder:text-ink-faint focus:border-link"
                />
                {createError && (
                  <p className="mt-1 text-micro text-disputed">{createError}</p>
                )}
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="submit"
                    disabled={switching || !newName.trim()}
                    className="cursor-pointer rounded-sm bg-ink px-2.5 py-1 text-micro font-medium text-paper transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {switching ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setCreateError(null);
                    }}
                    className="cursor-pointer px-1 text-micro text-ink-muted transition-colors duration-fast hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCreating(true);
                  // Focus after the input exists, so typing can start immediately.
                  requestAnimationFrame(() => newNameRef.current?.focus());
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-small text-ink-muted transition-colors duration-fast hover:bg-sunken hover:text-ink"
              >
                <span aria-hidden="true" className="w-3 text-ink-faint">
                  +
                </span>
                <span>New workspace</span>
              </button>
            )}
          </div>

          <div className="border-t border-rule">
            <button
              type="button"
              onClick={signOut}
              className="w-full cursor-pointer px-3 py-2.5 text-left text-small text-ink-muted transition-colors duration-fast hover:bg-sunken hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
