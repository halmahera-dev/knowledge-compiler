import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_BASE_URL: z.url().default(
      "https://bedrock-mantle.ap-southeast-3.api.aws/v1",
    ),
    BEDROCK_MODEL: z.string().min(1).default("zai.glm-5"),
    INTERNAL_API_URL: z.url().default("http://localhost:8000"),
    INTERNAL_API_TOKEN: z.string().min(1).default("dev-internal-token"),
    LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
    MASTRA_PORT: z.coerce.number().int().positive().default(4111),
    TURSO_DATABASE_URL: z.string().optional(),
    TURSO_AUTH_TOKEN: z.string().optional(),
    // Where Better Auth runs. Its JWKS lives at {AUTH_BASE_URL}/api/auth/jwks
    // and is also the `iss`/default `aud` every token carries. Must match the
    // BETTER_AUTH_URL that signed the token — see apps/api/app/config.py,
    // which verifies the same tokens against the same default.
    AUTH_BASE_URL: z.url().default("http://localhost:5173"),
    AUTH_AUDIENCE: z.string().optional(),
    // The browser origin allowed to call the memory API directly.
    CORS_ORIGIN: z.url().default("http://localhost:5173"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
