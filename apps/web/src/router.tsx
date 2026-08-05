import { createRouter } from "@tanstack/react-router";

import { ErrorState, NotFoundState, PendingState } from "./components/route-states";
import { routeTree } from "./routeTree.gen";

/**
 * TanStack Start looks for an exported `getRouter` on this module and calls it
 * per request, so it must return a fresh instance rather than a shared one.
 */
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,

    /*
     * Navigation should move when it is clicked.
     *
     * Every route loads its data in a `loader`, and the router waits for that
     * before swapping the view. With no pending component it waits silently, so
     * a click on a server a couple of hundred milliseconds away looked like a
     * dead link — the old page just sat there. The fix is not to load faster; it
     * is to stop pretending nothing is happening.
     *
     * 120ms before showing it, so a fast or already-cached navigation swaps
     * straight to the real page and never flashes a loading line. 300ms minimum
     * once shown, because a placeholder that appears and vanishes within a frame
     * or two is more distracting than none.
     */
    defaultPendingComponent: PendingState,
    defaultPendingMs: 120,
    defaultPendingMinMs: 300,

    /*
     * Hovering or touching a link starts its loader early, so the data is
     * usually there before the click lands.
     *
     * `defaultPreloadStaleTime` is what makes that worth doing: without it the
     * preloaded result is considered stale immediately and fetched again on
     * navigation, so the work is done twice and nothing is saved. Thirty seconds
     * is short enough that a page never shows yesterday's data, and the compile
     * feed updates over SSE regardless of this.
     *
     * Preloading is on intent, never eager — the app does not fetch six routes
     * of data because someone opened it.
     */
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    // Router-level rather than per-route: every route can fail, and the two
    // built-in fallbacks are a bare "Not Found" and a development error panel
    // with a stack trace. Routes that want something more specific — the wiki
    // page does — still override these.
    defaultNotFoundComponent: NotFoundState,
    defaultErrorComponent: ({ error, reset }) => <ErrorState error={error} reset={reset} />,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
