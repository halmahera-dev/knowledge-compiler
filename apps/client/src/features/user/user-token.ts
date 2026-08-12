/**
 * The bearer token the Python API and the agent expect, cached in memory.
 *
 * Better Auth mints short-lived JWTs (~15 min) from the httpOnly session cookie.
 * The token is deliberately NOT persisted: localStorage is readable by any XSS,
 * whereas the session cookie is not, so keeping the token in a module variable
 * that dies with the tab is strictly safer.
 *
 * Refetched shortly before expiry rather than on 401, so a request never fails
 * merely because the clock advanced mid-session.
 */

interface CachedToken {
	token: string;
	/** Epoch ms after which the token should be replaced. */
	refreshAt: number;
}

let cached: CachedToken | null = null;
let inFlight: Promise<string | null> | null = null;

const REFRESH_MARGIN_MS = 60_000;

function expiryOf(token: string): number {
	try {
		const payload = JSON.parse(
			atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
		);
		return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
	} catch {
		return 0;
	}
}

async function fetchToken(): Promise<string | null> {
	const response = await fetch("/api/auth/token", { credentials: "include" });
	if (!response.ok) return null;

	const body = (await response.json()) as { token?: string };
	if (!body.token) return null;

	const expiresAt = expiryOf(body.token);
	cached = {
		token: body.token,
		refreshAt: expiresAt ? expiresAt - REFRESH_MARGIN_MS : Date.now() + 60_000,
	};
	return body.token;
}

/** A valid token, or null when signed out. */
export async function getApiToken(): Promise<string | null> {
	if (cached && Date.now() < cached.refreshAt) return cached.token;

	inFlight ??= fetchToken().finally(() => {
		inFlight = null;
	});
	return inFlight;
}

/** Drop the cached token. Call on sign-out. */
export function clearApiToken(): void {
	cached = null;
	inFlight = null;
}
