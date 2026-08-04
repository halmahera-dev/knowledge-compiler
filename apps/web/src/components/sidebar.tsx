/**
 * The application's navigation column.
 *
 * It was a horizontal bar, and it ran out of room. Six destinations plus the
 * brand, the workspace switcher, the theme toggle and the tour button were
 * competing for one line, and every new surface made the squeeze worse — the
 * links had already been given their own scroll container to stop them widening
 * the page. A vertical list does not have that problem: adding a seventh
 * destination costs height, which there is plenty of.
 *
 * Three states rather than two, because a sidebar that only opens and closes is
 * wrong on a phone:
 *
 *   expanded   the default on desktop — icon and label
 *   collapsed  an icon rail, for when the page wants the width
 *   drawer     below `lg`, it slides over the content and is `display: none`
 *              when shut
 *
 * That last detail is load-bearing beyond the visuals. The product tour finds
 * its targets with `getBoundingClientRect` and skips any whose box is empty, so
 * a drawer merely translated off-screen would leave the tour pointing at
 * something nobody can see. `display: none` makes the box genuinely empty and
 * the tour correctly skips those steps.
 *
 * The collapsed width itself lives in styles.css, keyed off an attribute set
 * before first paint — see the note there for why it is not React state.
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  BookIcon,
  CloseIcon,
  CompassIcon,
  GraphIcon,
  InboxIcon,
  MeterIcon,
  PanelIcon,
  QuoteIcon,
} from "~/components/icons";

/**
 * Destinations, in the order the work happens: capture something, read what it
 * compiled into, ask about it, see how it connects, then what is missing.
 *
 * `tour` is given explicitly rather than derived from the label. Deriving it
 * turned "AI Logs" into `nav-ai logs`, a target with a space in it that no step
 * could ever match — the kind of thing that works until a label has two words.
 */
const NAV = [
  { to: "/capture", label: "Capture", tour: "nav-capture", Icon: InboxIcon },
  { to: "/wiki", label: "Wiki", tour: "nav-wiki", Icon: BookIcon },
  { to: "/ask", label: "Ask", tour: "nav-ask", Icon: QuoteIcon },
  { to: "/graph", label: "Graph", tour: "nav-graph", Icon: GraphIcon },
  { to: "/gaps", label: "Gaps", tour: "nav-gaps", Icon: CompassIcon },
  { to: "/ai-logs", label: "AI Logs", tour: "nav-ai-logs", Icon: MeterIcon },
] as const;

const STORAGE_KEY = "kc-sidebar";

/** The script that runs before first paint, so a collapsed rail never flashes open. */
export const SIDEBAR_INIT_SCRIPT = `try{if(localStorage.getItem('${STORAGE_KEY}')==='collapsed')document.documentElement.dataset.sidebar='collapsed'}catch(e){}`;

export function Sidebar({
  pathname,
  drawerOpen,
  onCloseDrawer,
}: {
  pathname: string;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  // Mirrors what the pre-paint script already applied. Held only so the toggle
  // can report `aria-expanded` honestly; the width itself is CSS's business.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.dataset.sidebar = "collapsed";
    else delete document.documentElement.dataset.sidebar;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "collapsed" : "expanded");
    } catch {
      // Private browsing. The sidebar still works; it just forgets.
    }
  }

  // Escape closes the drawer. Bound only while it is open, so it cannot swallow
  // Escape from a dialog on the page underneath.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, onCloseDrawer]);

  return (
    <>
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onCloseDrawer}
          className="fixed inset-0 z-40 cursor-default bg-ink/20 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        id="main-nav"
        className={`kc-sidebar sticky top-0 z-50 h-dvh shrink-0 flex-col border-r border-rule bg-paper max-lg:fixed max-lg:inset-y-0 max-lg:left-0 ${
          drawerOpen ? "flex" : "hidden"
        } lg:flex`}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 px-3">
          <Link
            to="/capture"
            onClick={onCloseDrawer}
            className="flex min-w-0 items-baseline gap-2.5 rounded-md px-2 py-1"
          >
            <span className="font-read text-[1.3rem] font-semibold tracking-tight">C</span>
            <span className="kc-sidebar-label truncate font-read text-[1.3rem] font-semibold tracking-tight">
              ompiler
            </span>
          </Link>

          <button
            type="button"
            onClick={onCloseDrawer}
            aria-label="Close navigation"
            className="ml-auto flex size-9 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-colors duration-fast hover:bg-sunken hover:text-ink lg:hidden"
          >
            <CloseIcon />
          </button>
        </div>

        <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
          {NAV.map(({ to, label, tour, Icon }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                to={to}
                onClick={onCloseDrawer}
                data-tour={tour}
                // The name is on the link, not only in the text: collapsing the
                // rail removes the label from the accessible tree entirely.
                aria-label={label}
                title={label}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-10 shrink-0 cursor-pointer items-center gap-3 rounded-md px-2.5 text-small transition-colors duration-fast ${
                  active
                    ? "bg-sunken font-medium text-ink"
                    : "text-ink-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                {/* Current location is marked by weight, fill and a rule — never
                    by colour alone. */}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-ink"
                  />
                )}
                <span className="shrink-0">
                  <Icon />
                </span>
                <span className="kc-sidebar-label truncate">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-rule p-3 max-lg:hidden">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls="main-nav"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-9 w-full cursor-pointer items-center gap-3 rounded-md px-2.5 text-small text-ink-muted transition-colors duration-fast hover:bg-sunken hover:text-ink"
          >
            <span className="shrink-0">
              <PanelIcon />
            </span>
            <span className="kc-sidebar-label truncate">Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}
