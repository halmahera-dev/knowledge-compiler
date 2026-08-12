/**
 * Mastra service entry point.
 *
 * The Python worker triggers compiles by POSTing to
 * `/api/workflows/compile-item/start-async`, which Mastra exposes for every
 * registered workflow.
 */
import { env } from "@kc/env/agent";
import { handleChatStream } from "@mastra/ai-sdk";
import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import { Mastra } from "@mastra/core/mastra";
import {
  MASTRA_RESOURCE_ID_KEY,
  RequestContext,
} from "@mastra/core/request-context";
import { registerApiRoute } from "@mastra/core/server";
import { MastraCompositeStore } from "@mastra/core/storage";
import { DuckDBStore } from "@mastra/duckdb";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import {
  MastraPlatformExporter,
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from "@mastra/observability";
import { createUIMessageStreamResponse } from "ai";

import { compilerAgent } from "./agents/compiler";
import { copilotAgent } from "./agents/copilot";
import { extractorAgent } from "./agents/extractor";
import { linkerAgent } from "./agents/linker";
import { authenticateToken, mapUserToResourceId } from "./auth";
import { config } from "./config";
import { compileItemWorkflow } from "./workflows/compile-item";

export const mastra = new Mastra({
  // The registry key is what appears in the URL, so it is pinned to the
  // workflow's own id — the Python worker posts to
  // /api/workflows/compile-item/start-async.
  workflows: {
    "compile-item": compileItemWorkflow,
  },
  // Registered so each stage can be exercised on its own in the Mastra
  // playground; compile-item drives them directly rather than through the registry.
  agents: { extractorAgent, compilerAgent, linkerAgent, copilotAgent },
  storage: new MastraCompositeStore({
    id: "composite-storage",
    default: new LibSQLStore({
      id: "mastra-storage",
      // Falls back to a local file when unset, matching how the rest of the
      // service degrades to local-only outside a hosted Turso database.
      url: env.TURSO_DATABASE_URL ?? "file:./mastra.db",
      authToken: env.TURSO_AUTH_TOKEN,
    }),
    domains: {
      observability: await new DuckDBStore().getStore("observability"),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "mastra",
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  logger: new PinoLogger({ name: "knowledge-compiler", level: "info" }),
  server: {
    port: config.server.port,
    apiRoutes: [
      registerApiRoute("/chat", {
        method: "POST",
        handler: async (c) => {
          const token = c.req
            .header("Authorization")
            ?.replace(/^Bearer\s+/i, "")
            .trim();
          const user = token ? await authenticateToken(token) : null;
          if (!user) return c.json({ error: "Unauthorized" }, 401);

          const body = await c.req.json();
          const stream = await handleChatStream({
            mastra: c.get("mastra"),
            agentId: "copilotAgent",
            version: "v5",
            params: {
              messages: body.messages,
              requestContext: new RequestContext([["token", token]]),
              memory: body.memory?.thread
                ? {
                    thread: body.memory.thread,
                    resource: mapUserToResourceId(user),
                  }
                : undefined,
              abortSignal: c.req.raw.signal,
            },
          });

          return createUIMessageStreamResponse({
            stream: stream as Parameters<
              typeof createUIMessageStreamResponse
            >[0]["stream"],
          });
        },
      }),
      registerApiRoute("/threads/:threadId/messages", {
        method: "GET",
        handler: async (c) => {
          const token = c.req
            .header("Authorization")
            ?.replace(/^Bearer\s+/i, "")
            .trim();
          const user = token ? await authenticateToken(token) : null;
          if (!user) return c.json({ error: "Unauthorized" }, 401);

          const threadId = c.req.param("threadId");
          const agentId = c.req.query("agentId");
          if (!agentId) {
            return c.json({ error: "agentId is required" }, 400);
          }

          const agent = c.get("mastra").getAgent(agentId);
          const memory = await agent.getMemory();
          if (!memory) {
            return c.json({ error: "Agent has no memory" }, 404);
          }

          const { messages } = await memory.recall({
            threadId,
            resourceId: mapUserToResourceId(user),
          });

          return c.json({ uiMessages: toAISdkV5Messages(messages) });
        },
      }),
    ],
    middleware: [
      {
        path: "/api/memory/*",
        handler: async (c, next) => {
          const token = c.req
            .header("Authorization")
            ?.replace(/^Bearer\s+/i, "")
            .trim();
          const user = token ? await authenticateToken(token) : null;
          if (!user) return c.json({ error: "Unauthorized" }, 401);

          c.get("requestContext").set(
            MASTRA_RESOURCE_ID_KEY,
            mapUserToResourceId(user),
          );
          return next();
        },
      },
    ],
    cors: {
      origin: env.CORS_ORIGIN,
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: false,
    },
  },
});
