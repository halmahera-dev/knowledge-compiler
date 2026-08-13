/**
 * Retrieval tool for the copilot agent.
 *
 * Calls the Python API's user-scoped search, not `api.ts`'s internal client:
 * `/api/v1/copilot/search` derives the workspace from the reader's own bearer
 * token, so the agent never names one and there is nothing to redirect.
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { config } from "../config";

interface RetrievedClaim {
  claimId: string;
  text: string;
  section: string;
  status: "asserted" | "disputed" | "superseded";
  pageSlug: string;
  pageTitle: string;
  quote: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
}

/**
 * A named cluster of the workspace. Orientation, never evidence.
 *
 * A claim carries a verbatim quote from a source the reader saved, so an
 * answer resting on it can be checked. A theme is prose the summariser agent
 * wrote about a group of pages — true to the material, but one remove from it,
 * with nothing to check it against. It answers "what is in here", which claims
 * cannot, and must never be used to answer "is X true".
 */
interface WorkspaceTheme {
  title: string;
  summary: string;
  nodeCount: number;
  pageCount: number;
}

const requestContextSchema = z.object({
  /** The reader's own bearer token, forwarded from the web app. */
  token: z.string(),
});

/** The API's own message is not written for a reader, so each status gets one. */
function explain(status: number): string {
  if (status === 401) return "Your session has expired. Sign in again to ask.";
  if (status === 403) return "You do not have access to this workspace.";
  if (status === 409)
    return "No workspace is selected. Create or choose one, then ask again.";
  return "That question could not be answered right now.";
}

export const searchKnowledge = createTool({
  id: "searchKnowledge",
  description:
    "Search the reader's compiled knowledge base for claims relevant to a question. Always call this before answering — you have no other source of evidence.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe(
        "What to search for. State the topic in full; do not rely on conversation history to fill it in.",
      ),
  }),
  outputSchema: z.object({
    claims: z.array(
      z.object({
        /** Short label to cite this claim by, e.g. "c1". Not the underlying claim id — that is opaque and unfit for prose. */
        label: z.string(),
        claimId: z.string(),
        text: z.string(),
        section: z.string(),
        status: z.enum(["asserted", "disputed", "superseded"]),
        pageSlug: z.string(),
        pageTitle: z.string(),
        quote: z.string(),
        sourceTitle: z.string().nullable(),
        sourceUrl: z.string().nullable(),
      }),
    ),
    /** The workspace's areas — orientation, never evidence. See WorkspaceTheme. */
    themes: z.array(
      z.object({
        title: z.string(),
        summary: z.string(),
        nodeCount: z.number(),
        pageCount: z.number(),
      }),
    ),
    /** Set when the API declined for a reason the reader can act on. Relay this verbatim and stop. */
    blocked: z.string().nullable(),
  }),
  requestContextSchema,
  execute: async ({ query }, { requestContext }) => {
    const token = requestContext?.get("token");
    if (!token) {
      return { claims: [], themes: [], blocked: "You are not signed in." };
    }

    const url = new URL("/api/v1/copilot/search", config.api.baseUrl);
    url.searchParams.set("q", query);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      // 5xx means the API is genuinely broken — surface as a tool error rather
      // than a normal result, so it is not mistaken for the copilot having
      // nothing to say.
      if (response.status >= 500) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `retrieval failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }
      return { claims: [], themes: [], blocked: explain(response.status) };
    }

    const data = (await response.json()) as {
      claims: RetrievedClaim[];
      themes?: WorkspaceTheme[];
      semantic: boolean;
    };

    const claims = (data.claims ?? []).map((claim, i) => ({
      ...claim,
      label: `c${i + 1}`,
    }));

    return { claims, themes: data.themes ?? [], blocked: null };
  },
});
