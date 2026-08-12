/**
 * Mastra service entry point.
 *
 * The Python worker triggers compiles by POSTing to
 * `/api/workflows/compile-item/start-async`, which Mastra exposes for every
 * registered workflow.
 */
import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";

import { compilerAgent, extractorAgent, linkerAgent, summariserAgent } from "./agents";
import { copilotAgent } from "./copilot";
import { config } from "./config";
import { compileItemWorkflow } from "./workflows/compile-item";
import { copilotAskWorkflow } from "./workflows/copilot-ask";

export const mastra = new Mastra({
  // The registry key is what appears in the URL, so it is pinned to the
  // workflow's own id — the Python worker posts to
  // /api/workflows/compile-item/start-async.
  workflows: {
    "compile-item": compileItemWorkflow,
    "copilot-ask": copilotAskWorkflow,
  },
  // Registered so each stage can be exercised on its own in the Mastra
  // playground; the workflow drives them directly rather than through the registry.
  agents: { extractorAgent, compilerAgent, linkerAgent, copilotAgent, summariserAgent },
  // Without this Mastra falls back to an in-memory store and says so on every
  // boot: workflow run state would vanish on restart, so a compile interrupted
  // by a reload could never be inspected or resumed.
  storage: new LibSQLStore({
    id: "knowledge-compiler",
    // Relative to the process working directory, which for the bundled dev
    // server is .mastra/output — a nested path like ./.mastra/x.db resolves
    // under that and fails to open, since the directory does not exist there.
    url: process.env.MASTRA_DB_URL ?? "file:mastra.db",
  }),

  logger: new PinoLogger({ name: "knowledge-compiler", level: "info" }),
  server: {
    port: config.server.port,
  },
});
