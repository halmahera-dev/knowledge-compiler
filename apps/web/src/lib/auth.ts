/**
 * Better Auth server.
 *
 * This is the one place where something other than the Python API writes to the
 * database, which is a deliberate exception to v1's single-writer rule. It is
 * contained two ways:
 *
 *   1. Better Auth gets its own `auth` Postgres schema. It never sees `kc`, and
 *      its migrations cannot touch application tables.
 *   2. The contract with FastAPI is a signed JWT, not a shared table. Python
 *      verifies against the JWKS endpoint and never reads Better Auth's schema,
 *      so the two can migrate independently.
 *
 * A workspace IS a Better Auth organization. The plugin already models
 * organizations, members with roles, and invitations; re-implementing that by
 * hand would be strictly worse.
 */
import { betterAuth } from "better-auth";
import { jwt, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Pool } from "pg";

import { ROLES, ac, workspaceRoles } from "./permissions";

const connectionString =
  process.env.COCKROACH_URL ??
  "postgresql://root@localhost:26257/knowledge_base?sslmode=disable";

const pool = new Pool({
  connectionString,
  // Pins every connection to the `auth` schema. Without this Better Auth would
  // create its tables in `public`, which belongs to an unrelated project sharing
  // this database.
  options: "-c search_path=auth",
});

/**
 * The caller's role in a workspace.
 *
 * Read straight from the `member` table rather than through `auth.api`, because
 * `definePayload` has no request headers to authenticate an API call with. This
 * is Better Auth's own table being read from inside Better Auth's own process,
 * which is a different thing from the Python API reaching into it.
 */
async function lookupRole(userId: string, organizationId: string): Promise<string | null> {
  try {
    const result = await pool.query<{ role: string }>(
      'SELECT "role" FROM "member" WHERE "userId" = $1 AND "organizationId" = $2 LIMIT 1',
      [userId, organizationId],
    );
    return result.rows[0]?.role ?? null;
  } catch {
    // No role means no access downstream. Failing closed is correct.
    return null;
  }
}

/**
 * Origins allowed to use the session cookie, beyond the app's own.
 *
 * This exists for the browser extension, whose origin is `chrome-extension://<id>`
 * and so is cross-origin to the app. It is read from the environment and defaults
 * to empty rather than to `chrome-extension://*`: a wildcard would let ANY
 * installed extension mint a workspace-scoped token from a signed-in session,
 * which is a real escalation and not something to ship as a default.
 *
 *   BETTER_AUTH_TRUSTED_ORIGINS=chrome-extension://abcdefghijklmnopabcdefghijklmnop
 */
export const trustedExtensionOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me",

  // Merged with baseURL by Better Auth, so the app itself stays trusted.
  trustedOrigins: trustedExtensionOrigins,

  database: pool,

  emailAndPassword: {
    enabled: true,
    // No mail service is wired up yet, so requiring verification would lock
    // every new account out. Revisit before this is exposed publicly.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  user: {
    additionalFields: {
      // Which workspace to open on sign-in. Stored on the user rather than
      // inferred, so returning to the app lands where you left off.
      lastWorkspaceId: { type: "string", required: false, input: false },
    },
  },

  plugins: [
    organization({
      ac,
      roles: workspaceRoles,
      // One personal workspace per person, created on sign-up, so nobody lands
      // in an empty app with nowhere to save anything.
      organizationLimit: 20,
      creatorRole: ROLES.OWNER,
      membershipLimit: 50,
    }),

    jwt({
      jwt: {
        issuer: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
        audience: "knowledge-compiler-api",
        // Short-lived on purpose: role and workspace are carried IN the token,
        // so a demotion or a workspace switch only takes effect at the next
        // mint. 15 minutes bounds how stale that can be.
        expirationTime: "15m",

        /**
         * The payload FastAPI depends on.
         *
         * `activeOrganizationId` and the caller's role are resolved here rather
         * than looked up by Python, so the API never has to read Better Auth's
         * tables — the token is the whole contract.
         */
        definePayload: async ({ user, session }) => {
          const workspaceId =
            (session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
          const role = workspaceId ? await lookupRole(user.id, workspaceId) : null;

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
    tanstackStartCookies(),
  ],
});

export type Auth = typeof auth;
