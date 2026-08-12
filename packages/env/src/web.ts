import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_API_URL: z.url(),
    VITE_MASTRA_URL: z.url(),
  },
  server: {
    // Server-only, unlike VITE_MASTRA_URL which ships in the client bundle.
    MASTRA_URL: z.url(),
  },
  runtimeEnv: { ...import.meta.env, MASTRA_URL: process.env.MASTRA_URL },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
