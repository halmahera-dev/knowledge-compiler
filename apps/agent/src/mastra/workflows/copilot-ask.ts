/**
 * One copilot turn: retrieve, then answer.
 *
 * Two steps rather than a tool-calling agent, for the same reason the compile
 * pipeline is a fixed sequence — retrieval must happen exactly once, with the
 * caller's own token, before the model sees anything. If the model decided when
 * to search, a prompt injection inside retrieved content could talk it into
 * searching again with different arguments.
 */
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { reportUsage } from "../api";
import { config } from "../config";
import {
  buildCopilotPrompt,
  copilotAgent,
  resolveCitations,
  searchQuery,
  type RetrievedClaim,
} from "../copilot";

const claimSchema = z.object({
  claimId: z.string(),
  text: z.string(),
  section: z.string(),
  status: z.enum(["asserted", "disputed", "superseded"]),
  pageSlug: z.string(),
  pageTitle: z.string(),
  quote: z.string(),
  sourceTitle: z.string().nullable(),
  sourceUrl: z.string().nullable(),
});

/** A prior turn, as the client already has it. */
const historyTurn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const workflowInput = z.object({
  question: z.string().min(2),
  /**
   * Earlier turns in this conversation, oldest first.
   *
   * Sent by the client rather than fetched here: the API is the only writer, and
   * having the agent read the thread as well would mean two sources for what the
   * conversation is. The client already has it on screen.
   */
  history: z.array(historyTurn).default([]),
  /**
   * The reader's own bearer token, forwarded verbatim.
   *
   * This is what makes scoping structural: the API derives the workspace from
   * this token, so the agent never names one and there is nothing to redirect.
   */
  token: z.string(),
  /**
   * The thread this question belongs to, for attributing what it cost.
   *
   * Optional, because a question can be asked before a session exists. When it
   * is absent the call is simply not recorded — the API places usage by session
   * or run and will not take a workspace on the agent's word, so there is
   * nothing safe to attribute it to.
   */
  sessionId: z.string().nullable().default(null),
});

const afterRetrieve = workflowInput.extend({
  claims: z.array(claimSchema),
  semantic: z.boolean(),
  /**
   * Set when the API declined for a reason the reader can act on — no workspace
   * selected, no membership, expired session. Carried forward instead of thrown
   * so the reason reaches the screen; a thrown error fails the whole run and the
   * UI can only say the agent returned nothing.
   */
  blocked: z.string().nullable(),
});

const workflowOutput = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({ claimId: z.string(), pageSlug: z.string(), pageTitle: z.string() }),
  ),
  claims: z.array(claimSchema),
  refused: z.boolean(),
});

/** The API's own message is not written for a reader, so each status gets one. */
function explain(status: number): string {
  if (status === 401) return "Your session has expired. Sign in again to ask.";
  if (status === 403) return "You do not have access to this workspace.";
  if (status === 409) return "No workspace is selected. Create or choose one, then ask again.";
  return "That question could not be answered right now.";
}

const retrieve = createStep({
  id: "retrieve",
  inputSchema: workflowInput,
  outputSchema: afterRetrieve,
  execute: async ({ inputData }) => {
    const { question, history, token } = inputData;

    const url = new URL("/api/v1/copilot/search", config.api.baseUrl);
    // A short follow-up carries no searchable text of its own.
    url.searchParams.set("q", searchQuery(question, history));

    const response = await fetch(url, {
      // The reader's token, not the service token: the API answers with their
      // workspace and nothing else.
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      // 5xx means the API is genuinely broken — fail loudly so it is not mistaken
      // for the copilot having nothing to say. 4xx is the reader's own state and
      // belongs on screen as prose.
      if (response.status >= 500) {
        throw new Error(`retrieval failed (${response.status}): ${body.slice(0, 200)}`);
      }
      return { ...inputData, claims: [], semantic: false, blocked: explain(response.status) };
    }

    const data = (await response.json()) as {
      claims: RetrievedClaim[];
      semantic: boolean;
    };
    return {
      ...inputData,
      claims: data.claims ?? [],
      semantic: data.semantic ?? true,
      blocked: null,
    };
  },
});

const answer = createStep({
  id: "answer",
  inputSchema: afterRetrieve,
  outputSchema: workflowOutput,
  execute: async ({ inputData }) => {
    const { question, claims, history, blocked, sessionId } = inputData;

    // Short-circuit rather than asking the model to decline: it is cheaper, and
    // a hardcoded refusal cannot be argued out of by injected content.
    if (blocked || claims.length === 0) {
      return {
        answer:
          blocked ??
          "Nothing in this workspace covers that yet. Save something on the topic and it will be compiled in.",
        citations: [],
        claims: [],
        refused: true,
      };
    }

    const startedAt = Date.now();
    const result = await copilotAgent.generate(buildCopilotPrompt(question, claims, history));
    const text = result.text ?? "";

    // A refusal costs nothing because it short-circuits above, so everything
    // reaching here is a real call worth recording.
    await reportUsage({
      operation: "copilot",
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      latencyMs: Date.now() - startedAt,
      chatSessionId: sessionId ?? undefined,
    });

    const citations = resolveCitations(text, claims);

    return {
      answer: text,
      citations,
      claims,
      // An answer citing nothing is either a refusal or an unsupported claim.
      // Either way the UI should present it as not-grounded.
      refused: citations.length === 0,
    };
  },
});

export const copilotAskWorkflow = createWorkflow({
  id: "copilot-ask",
  description: "Answer a question from the workspace's compiled knowledge, with citations.",
  inputSchema: workflowInput,
  outputSchema: workflowOutput,
})
  .then(retrieve)
  .then(answer)
  .commit();
