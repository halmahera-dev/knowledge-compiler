/// <reference types="vite/client" />
import {
  HeadContent,
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

import { MenuIcon, MoonIcon, SunIcon } from "~/components/icons";
import { ProductTour, VisualHelpButton } from "~/components/product-tour";
import { SIDEBAR_INIT_SCRIPT, Sidebar } from "~/components/sidebar";
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A drawer left open over the page you just navigated to is a dead end on a
  // phone — the link worked, but the destination is behind the thing you tapped
  // it in. Closing on every path change also covers back and forward.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          // Applies the stored theme and sidebar width before first paint.
          // Without this the page renders light then flips, and a collapsed
          // sidebar springs open on every load — both worse than no memory at all.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('kc-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}${SIDEBAR_INIT_SCRIPT}`,
          }}
        />
      </head>
      <body className="bg-paper text-ink">
        {bare ? (
          <div className="flex min-h-dvh flex-col">
            <main className="flex-1">
              <Outlet />
            </main>
          </div>
        ) : (
          // The nav is a column and everything else is the rest of the row, so
          // the content stretches into whatever the sidebar is not using —
          // collapsing the rail genuinely gives the page the width back.
          <div className="flex min-h-dvh">
            <Sidebar
              pathname={pathname}
              drawerOpen={drawerOpen}
              onCloseDrawer={() => setDrawerOpen(false)}
            />

            {/* min-w-0 is what stops a wide table or a long unbroken URL inside
                a page from pushing this column past the viewport: a flex item's
                default min-width is its content, not zero. */}
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-md">
                <div className="flex h-16 items-center gap-2 px-4 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    aria-label="Open navigation"
                    aria-controls="main-nav"
                    aria-expanded={drawerOpen}
                    className="flex size-9 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-colors duration-fast hover:bg-sunken hover:text-ink lg:hidden"
                  >
                    <MenuIcon />
                  </button>

                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <VisualHelpButton onStart={() => setTourOpen(true)} />
                    <ThemeToggle />
                    <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-rule sm:block" />
                    <WorkspaceMenu />
                  </div>
                </div>
              </header>

              {/* No footer. It carried one sentence — "Compiled by an agent.
                  Every claim links back to the source it came from" — on every
                  page of a signed-in app, where both halves are already evident
                  from the compile feed and the citations themselves. A rule and
                  40px of chrome to restate what the product is doing in front
                  of you. */}
              <main className="flex-1">
                <Outlet />
              </main>
            </div>
          </div>
        )}

        {tourOpen && <ProductTour onClose={() => setTourOpen(false)} />}
        <Scripts />
      </body>
    </html>
  );
}
