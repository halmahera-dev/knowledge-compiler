/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/400-italic.css";

// Imported for their hashed build URLs, so they can be preloaded by href.
import serifHeading from "@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2?url";
import uiRegular from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";

import {
  BookIcon,
  CompassIcon,
  GraphIcon,
  InboxIcon,
  MeterIcon,
  MoonIcon,
  QuoteIcon,
  SunIcon,
} from "~/components/icons";
import { ProductTour, VisualHelpButton } from "~/components/product-tour";
import { WorkspaceMenu } from "~/components/workspace-menu";
import styles from "~/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Knowledge Compiler" },
      {
        name: "description",
        content: "Everything you read, compiled into one self-organizing wiki and graph.",
      },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      /*
       * Two fonts, preloaded; the other six are left to discovery.
       *
       * Without this the browser cannot know a font is needed until it has
       * fetched and parsed the stylesheet that declares it, so the largest text
       * on the page paints in a fallback and swaps late. These two are the ones
       * that matter: the serif at 600 sets every page's heading — including the
       * landing page's display headline, which is its LCP element — and Inter at
       * 400 sets the surrounding interface.
       *
       * `crossOrigin` is required even though these are same-origin: fonts are
       * fetched in CORS mode, and a preload whose mode does not match is
       * discarded and fetched a second time, which is worse than not preloading.
       */
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: serifHeading,
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: uiRegular,
        crossOrigin: "anonymous",
      },
    ],
  }),
  component: RootComponent,
});

/**
 * Routes that render without the application shell.
 *
 * The landing page and sign-in are for people who are not in the app yet, and a
 * nav bar of links they cannot follow — or a workspace switcher with no
 * workspace — reads as a broken app rather than an entrance to one.
 */
const BARE_ROUTES = new Set(["/", "/signin"]);

const NAV = [
  { to: "/capture", label: "Capture", Icon: InboxIcon },
  { to: "/wiki", label: "Wiki", Icon: BookIcon },
  { to: "/ask", label: "Ask", Icon: QuoteIcon },
  { to: "/graph", label: "Graph", Icon: GraphIcon },
  { to: "/gaps", label: "Gaps", Icon: CompassIcon },
  { to: "/ai-logs", label: "AI Logs", Icon: MeterIcon },
] as const;

function ThemeToggle() {
  // `null` means "follow the OS", which is the initial state — an explicit
  // choice is only stored once the user makes one.
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("kc-theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      document.documentElement.dataset.theme = stored;
    }
  }, []);

  function toggle() {
    const current =
      theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("kc-theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // The control is icon-only, so it needs an accessible name.
      aria-label="Toggle colour theme"
      title="Toggle colour theme"
      className="grid size-11 cursor-pointer place-items-center rounded-md text-ink-faint transition-colors duration-fast hover:bg-sunken hover:text-ink"
    >
      <span className="hidden dark:block">
        <SunIcon />
      </span>
      <span className="dark:hidden">
        <MoonIcon />
      </span>
    </button>
  );
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = BARE_ROUTES.has(pathname);
  const [tourOpen, setTourOpen] = useState(false);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          // Applies the stored theme before first paint. Without this the page
          // renders light then flips, which is worse than no toggle at all.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('kc-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-paper text-ink">
        <div className="flex min-h-dvh flex-col">
          {!bare && (
          <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-[76rem] items-center gap-3 px-5 sm:gap-6">
              <Link to="/capture" className="group flex shrink-0 items-baseline gap-2.5">
                <span className="font-read text-[1.3rem] font-semibold tracking-tight">
                  Compiler
                </span>
                <span className="eyebrow hidden sm:inline">knowledge base</span>
              </Link>

              {/* Scrolls within itself rather than widening the page. At 375px the
                  five links, the theme toggle and the workspace switcher come to
                  451px, which was forcing a horizontal scrollbar on the whole
                  document — on every route. The switcher and toggle stay pinned
                  outside this box, since scrolling away the way out of a
                  workspace is not an acceptable trade. */}
              <nav
                aria-label="Main"
                className="scrollbar-none ml-auto flex min-w-0 items-center gap-0.5 overflow-x-auto"
              >
                {NAV.map(({ to, label, Icon }) => {
                  const active = pathname === to || pathname.startsWith(`${to}/`);
                  return (
                    <Link
                      key={to}
                      to={to}
                      // Current location is marked by weight and a rule, not by
                      // colour alone.
                      data-tour={`nav-${label.toLowerCase()}`}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-small transition-colors duration-fast sm:px-3 ${
                        active
                          ? "font-medium text-ink"
                          : "text-ink-muted hover:bg-sunken hover:text-ink"
                      }`}
                    >
                      <Icon />
                      <span className="hidden sm:inline">{label}</span>
                      {active && (
                        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink sm:inset-x-3" />
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="flex shrink-0 items-center gap-0.5">
                <VisualHelpButton onStart={() => setTourOpen(true)} />
                <ThemeToggle />
                <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-rule sm:block" />
                <WorkspaceMenu />
              </div>
            </div>
          </header>
          )}

          <main className="flex-1">
            <Outlet />
          </main>

          {tourOpen && <ProductTour onClose={() => setTourOpen(false)} />}

          {!bare && (
          <footer className="border-t border-rule py-6">
            <p className="mx-auto max-w-[76rem] px-5 text-micro text-ink-faint">
              Compiled by an agent. Every claim links back to the source it came from.
            </p>
          </footer>
          )}
        </div>
        <Scripts />
      </body>
    </html>
  );
}
