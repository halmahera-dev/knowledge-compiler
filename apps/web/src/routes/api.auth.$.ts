/**
 * Mounts Better Auth at /api/auth/*.
 *
 * This one route serves sign-in, sign-up, sign-out, session, the organization
 * endpoints, and — the part FastAPI depends on — `/api/auth/jwks`, which is how
 * Python gets the public key to verify tokens without ever reading Better Auth's
 * tables.
 *
 * It also adds CORS for the browser extension. Better Auth's `trustedOrigins`
 * guards state-changing routes but does not emit CORS headers, and without them
 * the extension's `fetch` is blocked by the browser before the response is ever
 * read — a request that succeeds under curl and fails in Chrome. The allowlist is
 * the same env-configured one Better Auth uses, so an origin is either trusted
 * for both or for neither.
 */
import { createFileRoute } from "@tanstack/react-router";

import { auth, trustedExtensionOrigins } from "~/lib/auth";

/**
 * Echoes the caller's origin when it is allowlisted.
 *
 * Echoed rather than wildcarded because `Access-Control-Allow-Origin: *` is
 * invalid alongside credentials, and credentials are the entire point — the
 * extension has no login and borrows the app's session cookie.
 */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !trustedExtensionOrigins.includes(origin)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    // Cached per-origin, so a second origin is not served the first one's answer.
    Vary: "Origin",
  };
}
// No preflight handling here, and none needed: the extension's only call is a
// GET with credentials and no custom headers, which is a simple request. The
// dev server answers OPTIONS itself before this route sees it, so an OPTIONS
// handler here would be dead code that reads as working CORS.

async function handle(request: Request): Promise<Response> {
  const cors = corsHeaders(request);

  const response = await auth.handler(request);
  if (Object.keys(cors).length === 0) return response;

  // Rebuilt rather than mutated — `auth.handler` may return a Response whose
  // headers are immutable.
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => handle(request),
      POST: ({ request }: { request: Request }) => handle(request),
    },
  },
});
