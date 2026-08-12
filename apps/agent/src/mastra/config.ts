import { env } from "@kc/env/agent";

export const config = {
  model: {
    id: `custom/${env.BEDROCK_MODEL}`,
    url: env.OPENAI_BASE_URL,
    apiKey: env.OPENAI_API_KEY,
  },
  api: {
    baseUrl: env.INTERNAL_API_URL.replace(/\/$/, ""),
    token: env.INTERNAL_API_TOKEN,
  },
  server: {
    port: env.MASTRA_PORT,
  },
  maxRetries: env.LLM_MAX_RETRIES,
} as const;
