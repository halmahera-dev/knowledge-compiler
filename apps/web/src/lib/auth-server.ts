/**
 * Server functions for reading the session during SSR.
 *
 * Route `beforeLoad` guards call these, so an unauthenticated request is
 * redirected on the server before any protected UI is rendered — rather than
 * flashing the app and then bouncing.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from "./auth";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const headers = new Headers(getRequestHeaders() as HeadersInit);
  return auth.api.getSession({ headers });
});

/**
 * The bearer token the browser sends to the Python API.
 *
 * Minted per request from the session cookie rather than stored client-side: a
 * JWT in localStorage is readable by any XSS, whereas the session cookie is
 * httpOnly and this token lives only as long as the request that used it.
 */
export const getApiToken = createServerFn({ method: "GET" }).handler(async () => {
  const headers = new Headers(getRequestHeaders() as HeadersInit);
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const result = await auth.api.getToken({ headers });
  return result?.token ?? null;
});

/** The workspaces this user belongs to, for the switcher. */
export const listWorkspaces = createServerFn({ method: "GET" }).handler(async () => {
  const headers = new Headers(getRequestHeaders() as HeadersInit);
  const session = await auth.api.getSession({ headers });
  if (!session) return [];

  return auth.api.listOrganizations({ headers });
});
