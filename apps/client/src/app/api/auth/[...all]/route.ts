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
 * the extension's `fetch` for `/api/auth/token` is blocked by the browser before
 * the response is ever read — a request that succeeds under curl and fails in
 * Chrome. The allowlist is the same env-configured one Better Auth uses, so an
 * origin is either trusted for both or for neither.
 */
import { auth, trustedExtensionOrigins } from "@kc/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth);

/**
 * Echoes the caller's origin when it is allowlisted.
 *
 * Echoed rather than wildcarded because `Access-Control-Allow-Origin: *` is
 * invalid alongside credentials, and credentials are the entire point — the
 * extension has no login of its own and borrows the app's session cookie.
 */
function corsHeaders(request: Request): Record<string, string> {
	const origin = request.headers.get("origin");
	if (!origin || !trustedExtensionOrigins.includes(origin)) return {};

	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Credentials": "true",
		// Cached per-origin, so a second origin is never served the first one's
		// answer from a shared cache.
		Vary: "Origin",
	};
}

// No preflight handler, and none needed: the extension's only cross-origin call
// is a GET with credentials and no custom headers, which is a simple request.
// An OPTIONS export here would be dead code that reads as working CORS.
function withCors(
	inner: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
	return async (request) => {
		const cors = corsHeaders(request);
		const response = await inner(request);
		if (Object.keys(cors).length === 0) return response;

		// Rebuilt rather than mutated — the handler may return a Response whose
		// headers are immutable.
		const headers = new Headers(response.headers);
		for (const [key, value] of Object.entries(cors)) headers.set(key, value);
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	};
}

export const GET = withCors(handler.GET);
export const POST = withCors(handler.POST);
