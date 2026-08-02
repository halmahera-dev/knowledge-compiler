import { createRouter } from "@tanstack/react-router";

import { ErrorState, NotFoundState } from "./components/route-states";
import { routeTree } from "./routeTree.gen";

/**
 * TanStack Start looks for an exported `getRouter` on this module and calls it
 * per request, so it must return a fresh instance rather than a shared one.
 */
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
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
