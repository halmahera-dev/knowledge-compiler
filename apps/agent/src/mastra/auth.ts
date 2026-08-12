/**
 * Verifies the JWTs Better Auth issues, so the browser can call the memory API
 * (`/api/memory/*`) directly instead of through a Next.js proxy.
 *
 * Mirrors apps/api/app/auth.py: EdDSA-signed, short-lived tokens checked against
 * the published JWKS. `mapUserToResourceId` is what makes this safe — Mastra
 * scopes every memory read/write to the returned id and ignores any
 * client-supplied `resourceId`, so a browser can never read another user's
 * threads by editing a query param.
 */
import { env } from "@kc/env/agent";
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(new URL("/api/auth/jwks", env.AUTH_BASE_URL));

// better-auth's jwt plugin defaults both `iss` and `aud` to the configured
// baseURL when no explicit audience is set — see plugins/jwt/sign.mjs.
const audience = env.AUTH_AUDIENCE ?? env.AUTH_BASE_URL;

export type AuthenticatedUser = { id: string };

export async function authenticateToken(
  token: string,
): Promise<AuthenticatedUser | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.AUTH_BASE_URL,
      audience,
      algorithms: ["EdDSA"],
    });
    return payload.sub ? { id: payload.sub } : null;
  } catch {
    return null;
  }
}

export function mapUserToResourceId(user: AuthenticatedUser) {
  return user.id;
}
