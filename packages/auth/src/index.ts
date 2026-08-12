import { createPrismaClient } from "@kc/db";
import { env } from "@kc/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { jwt, organization } from "better-auth/plugins";

export function createAuth() {
  const prisma = createPrismaClient();
  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
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
    plugins: [organization(), jwt(), nextCookies()],
  });
}

export const auth = createAuth();
