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

export function createAuth() {
	return betterAuth({
		database: prismaAdapter(prisma, {
			provider: "postgresql",
		}),
		trustedOrigins: [env.CORS_ORIGIN, ...trustedExtensionOrigins],
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
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
						return { data: { ...session, activeOrganizationId: organizationId } };
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
