import { createPrismaClient } from "@kc/db";
import { env } from "@kc/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { jwt, organization } from "better-auth/plugins";

const prisma = createPrismaClient();

/**
 * The caller's role in a workspace.
 *
 * Read straight from the `member` table rather than through `auth.api`, because
 * `definePayload` has no request headers to authenticate an API call with. This
 * is Better Auth's own table being read from inside Better Auth's own process,
 * which is a different thing from the Python API reaching into it.
 */
async function lookupRole(
	userId: string,
	organizationId: string,
): Promise<string | null> {
	try {
		const member = await prisma.member.findFirst({
			where: { userId, organizationId },
			select: { role: true },
		});
		return member?.role ?? null;
	} catch {
		// No role means no access downstream. Failing closed is correct.
		return null;
	}
}

/** The workspace a fresh session should open in: the most recently joined one. */
async function defaultOrganizationId(userId: string): Promise<string | null> {
	try {
		const member = await prisma.member.findFirst({
			where: { userId },
			orderBy: { createdAt: "desc" },
			select: { organizationId: true },
		});
		return member?.organizationId ?? null;
	} catch {
		return null;
	}
}

/**
 * Origins allowed to use the session cookie, beyond the app's own.
 *
 * This exists for the browser extension, whose origin is
 * `chrome-extension://<id>` and so is cross-origin to the app. Read from the
 * environment and defaulting to empty rather than to `chrome-extension://*`: a
 * wildcard would let ANY installed extension mint a workspace-scoped token from
 * a signed-in session, which is a real escalation and not a safe default.
 */
export const trustedExtensionOrigins = (
	process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? ""
)
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

/**
 * Origins that look like a browser extension, and nothing else.
 *
 * The gate for everything below: a request from the app itself never reaches
 * the database, and no value that is not a `chrome-extension://` origin can
 * ever be matched against a registered one.
 */
function isExtensionOrigin(origin: string): boolean {
	return /^(chrome|moz)-extension:\/\/[a-zA-Z0-9-]+$/.test(origin);
}

/**
 * Has *someone* vouched for the extension making this request?
 *
 * Returns the origin, or nothing. Deliberately not "which user vouched for it":
 * this answers Better Auth's CSRF question, which is whether the origin is
 * known to the installation at all. Whether *this* reader may read the response
 * is a different question, answered by the CORS echo in the auth route — and
 * that one is per-user.
 *
 * Splitting it that way keeps this path off the session table on every auth
 * request, while the token still cannot be read by an extension its owner never
 * registered.
 */
async function registeredExtensionOrigin(
	request: Request | undefined,
): Promise<string[]> {
	// Better Auth types the request as optional: some internal calls have none,
	// and a call with no request cannot be a cross-origin one.
	const origin = request?.headers.get("origin") ?? "";

	if (!isExtensionOrigin(origin)) {
		return [];
	}

	try {
		const known = await prisma.extensionOrigin.findFirst({
			where: { origin },
			select: { id: true },
		});
		return known ? [origin] : [];
	} catch {
		// A database that cannot be reached must not widen the allowlist.
		return [];
	}
}

/**
 * The extensions one person has vouched for.
 *
 * This is the per-user half, used by the CORS echo: an extension may only read
 * a token minted from a session whose owner registered it.
 */
export async function extensionOriginsForUser(
	userId: string,
): Promise<string[]> {
	try {
		const rows = await prisma.extensionOrigin.findMany({
			where: { userId },
			select: { origin: true },
		});
		return rows.map((row) => row.origin);
	} catch {
		return [];
	}
}

/** Register one, idempotently. The person is vouching for their own install. */
export async function registerExtensionOrigin(
	userId: string,
	origin: string,
	label: string,
): Promise<{ origin: string } | null> {
	if (!isExtensionOrigin(origin)) {
		return null;
	}

	await prisma.extensionOrigin.upsert({
		where: { userId_origin: { userId, origin } },
		create: { userId, origin, label },
		update: { label },
	});

	return { origin };
}

export async function forgetExtensionOrigin(
	userId: string,
	origin: string,
): Promise<void> {
	await prisma.extensionOrigin.deleteMany({ where: { userId, origin } });
}

export function createAuth() {
	return betterAuth({
		database: prismaAdapter(prisma, {
			provider: "postgresql",
		}),
		// A function, not a list, because the list cannot be known ahead of time:
		// every unpacked extension install gets its own id. Better Auth merges
		// what this returns with its own static set (baseURL included), and it
		// runs on any request carrying a cookie — which is exactly what the
		// extension's credentialed token fetch is.
		trustedOrigins: async (request) => [
			env.CORS_ORIGIN,
			...trustedExtensionOrigins,
			...(await registeredExtensionOrigin(request)),
		],
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: env.BETTER_AUTH_URL.startsWith("https") ? "none" : "lax",
				secure: env.BETTER_AUTH_URL.startsWith("https"),
				httpOnly: true,
			},
		},
		databaseHooks: {
			session: {
				create: {
					/**
					 * Open a new session in a workspace rather than in none.
					 *
					 * Without this a signed-in user has `activeOrganizationId = null`,
					 * every minted token carries `workspaceId: null`, and the Python API
					 * answers 409 to every scoped request — which reads as the whole app
					 * being broken rather than as a workspace never having been chosen.
					 */
					before: async (session) => {
						const organizationId = await defaultOrganizationId(session.userId);
						if (!organizationId) return;
						return {
							data: { ...session, activeOrganizationId: organizationId },
						};
					},
				},
			},
		},
		plugins: [
			organization(),
			jwt({
				jwt: {
					// Short-lived on purpose: role and workspace are carried IN the
					// token, so a demotion or a workspace switch only takes effect at
					// the next mint. 15 minutes bounds how stale that can be.
					expirationTime: "15m",

					/**
					 * The payload FastAPI depends on.
					 *
					 * The active workspace and the caller's role are resolved here
					 * rather than looked up by Python, so the API never has to read
					 * Better Auth's tables — the token is the whole contract. Dropping
					 * this is what made every scoped endpoint answer 409.
					 */
					definePayload: async ({ user, session }) => {
						const workspaceId =
							(session as { activeOrganizationId?: string | null })
								.activeOrganizationId ?? null;
						const role = workspaceId
							? await lookupRole(user.id, workspaceId)
							: null;

						return {
							id: user.id,
							email: user.email,
							name: user.name,
							workspaceId,
							role,
						};
					},
				},
			}),
			// Must be last — it wraps the other plugins' responses to attach cookies.
			nextCookies(),
		],
	});
}

export const auth = createAuth();
