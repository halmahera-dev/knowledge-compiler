/**
 * Asking the copilot.
 *
 * Questions go to Mastra, which reasons; conversations are stored through the
 * Python API, which owns data. Routing the question through Python would add a
 * hop that only forwards, and letting Mastra write the thread would give the
 * knowledge base a second writer.
 *
 * The reader's own token goes with the request. The API derives the workspace
 * from it, so the workspace is never a parameter anyone — including the model —
 * could tamper with.
 */
import { getToken } from "./token";

const MASTRA_URL = (import.meta.env.VITE_MASTRA_URL ?? "http://localhost:4111").replace(
  /\/$/,
  "",
);

export interface CopilotClaim {
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

export interface Citation {
  claimId: string;
  pageSlug: string;
  pageTitle: string;
}

export interface CopilotAnswer {
  answer: string;
  citations: Citation[];
  claims: CopilotClaim[];
  refused: boolean;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Ask one question, with the thread so far for context.
 *
 * History is sent rather than looked up. The client already has it on screen,
 * and having the agent fetch it as well would mean two answers to "what has been
 * said". Only role and content travel: the claims behind earlier answers are
 * evidence for those turns, not this one.
 */
export async function askCopilot(
  question: string,
  history: HistoryTurn[] = [],
): Promise<CopilotAnswer> {
  const token = await getToken();
  if (!token) throw new Error("Sign in to ask.");

  const response = await fetch(`${MASTRA_URL}/api/workflows/copilot-ask/start-async`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputData: { question, history, token } }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // The agent being down is the likeliest cause and the least obvious from a
    // bare status code, so it is named.
    throw new Error(
      response.status === 404 || response.status >= 500
        ? "The agent isn't responding. Is `pnpm dev` running?"
        : `Ask failed (${response.status}): ${body.slice(0, 160)}`,
    );
  }

  const body = (await response.json()) as { result?: CopilotAnswer };
  if (!body.result) throw new Error("The agent returned no answer.");
  return body.result;
}
