/**
 * Agent configuration.
 *
 * Reads the same `.env` at the repo root that the Python API and web app use, so
 * the Bedrock credentials are defined exactly once.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../../.env") });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env at the repo root and fill it in.`,
    );
  }
  return value;
}

export const config = {
  /**
   * GLM-5 through Bedrock Mantle's OpenAI-compatible surface.
   *
   * The `custom/` prefix tells Mastra to treat this as an OpenAI-compatible
   * endpoint rather than looking the model up in its provider registry. The URL
   * must be the API base (`.../v1`) — Mastra appends the route itself.
   */
  model: {
    id: `custom/${process.env.BEDROCK_MODEL ?? "zai.glm-5"}`,
    url: required("OPENAI_BASE_URL", "https://bedrock-mantle.ap-southeast-3.api.aws/v1"),
    apiKey: required("OPENAI_API_KEY", "missing-key"),
  },

  /** The Python API. The agent holds no database connection; this is its only data path. */
  api: {
    baseUrl: (process.env.INTERNAL_API_URL ?? "http://localhost:8000").replace(/\/$/, ""),
    token: process.env.INTERNAL_API_TOKEN ?? "dev-internal-token",
  },

  server: {
    port: Number(process.env.MASTRA_PORT ?? 4111),
  },

  /**
   * How many times an LLM step may be retried when its output fails schema
   * validation. Bounded, because a model that cannot produce the shape twice
   * will not produce it on the tenth attempt either — better to fail the run
   * with the raw output kept for inspection.
   */
  maxRetries: Number(process.env.LLM_MAX_RETRIES ?? 2),
} as const;
