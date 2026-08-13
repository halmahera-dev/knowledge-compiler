import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Sends a signed-out visitor to sign in, carrying where they were going.
 *
 * `proxy`, not `middleware` — Next 16 deprecated and renamed that convention.
 *
 * This is an **optimistic cookie check, not authentication**. It never opens a
 * database connection and never validates the session; a forged cookie gets
 * past it and then meets the real gate in `AuthenticatedAppShell`, which calls
 * `auth.api.getSession`. What it buys is the redirect target: a Server
 * Component cannot read the pathname it is rendering, so without this a
 * deep-linked visitor lands on the sign-in page and, once through it, on the
 * home page rather than the page whose link they followed.
 *
 * The cookie is read with Better Auth's own helper rather than by name, because
 * the name is composed from a configurable prefix and gains a `__Secure-` prefix
 * over HTTPS. Hardcoding one form works in development and silently stops
 * redirecting in production — every visitor would reach the shell instead, which
 * still refuses them, but from the wrong place and without the return path.
 */

/** Paths that render without a session. Everything else is inside the app. */
const PUBLIC = new Set(["/login", "/register", "/landing"]);

export function proxy(request: NextRequest) {
	const { pathname, search } = request.nextUrl;

	if (PUBLIC.has(pathname) || getSessionCookie(request)) {
		return NextResponse.next();
	}

	const url = request.nextUrl.clone();

	// A stranger who typed the bare domain gets the pitch, not a password box.
	// Only the root: any other path was a deliberate destination, so it keeps the
	// sign-in redirect that carries them back to it.
	if (pathname === "/") {
		url.pathname = "/landing";
		url.search = "";
		return NextResponse.redirect(url);
	}

	url.pathname = "/login";
	url.search = "";
	// Same-origin by construction — it is this request's own path — but it is
	// read back through `safeRedirect` on the other side, where it arrives as an
	// attacker-controllable query parameter.
	url.searchParams.set("redirect", `${pathname}${search}`);
	return NextResponse.redirect(url);
}

export const config = {
	/**
	 * Everything except Next's own assets, the auth handler, and static files.
	 *
	 * `/api/auth` must be excluded or the sign-in request itself is redirected to
	 * the sign-in page — a loop that presents as "the password form does nothing".
	 */
	matcher: [
		"/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|zip)$).*)",
	],
};
