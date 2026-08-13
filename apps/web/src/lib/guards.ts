/**
 * Route guards.
 *
 * Without one, a signed-out visitor following a link to a compiled page does not
 * get sent to sign in — the loader fetches without a session, the API refuses,
 * and the route throws. What they actually see is a raw error panel inside the
 * full app shell, on a URL somebody shared with them in good faith.
 *
 * Guarding in `beforeLoad` means the redirect happens on the server, before any
 * protected markup is rendered, rather than flashing the app and then bouncing.
 */
import { redirect } from "@tanstack/react-router";

import { getSession } from "./auth-server";

/**
 * Redirect targets are restricted to paths on this app.
 *
 * `redirect` arrives from the query string and is handed to the router after
 * sign-in, so an unchecked value turns the sign-in page into an open redirect:
 * `/signin?redirect=https://…` would send someone who just typed their password
 * to another origin. Protocol-relative `//host` is rejected for the same reason —
 * browsers treat it as absolute.
 */
export function safeRedirect(value: unknown, fallback = "/capture"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}

/** `beforeLoad` for any route that needs a signed-in reader. */
export async function requireSession({ location }: { location: { href: string } }) {
  const session = await getSession();
  if (session) return;

  throw redirect({
    to: "/signin",
    // Carries where they were going, so the link they followed still works after
    // the detour instead of dumping them on a default page.
    search: { redirect: safeRedirect(location.href), mode: "signin" as const },
  });
}
