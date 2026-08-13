import { loadRootEnv } from "./load";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Called, not imported for its side effect: bundlers drop side-effect-only
// imports, and this one vanished from Mastra's output.
loadRootEnv();

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
