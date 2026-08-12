/**
 * The workspace copilot.
 *
 * Answers only from what the workspace has already compiled, and cites the claim
 * behind every statement. It has no web access and no write tools — the value is
 * that an answer can be checked, and a copilot that could also invent or edit
 * would destroy exactly that.
 *
 * Workspace scoping is structural rather than instructed. The caller's own bearer
 * token is forwarded to the API, and the API derives the workspace from it, so
 * the agent never sends a workspace id and there is nothing for a prompt
 * injection in the retrieved content to redirect.
 */
import { Agent } from "@mastra/core/agent";

import { config } from "./config";

export interface RetrievedClaim {
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
 * The distinction is the whole reason this is a separate type from
 * `RetrievedClaim`. A claim carries a verbatim quote from a source the reader
 * saved, so an answer resting on it can be checked. A theme is prose the
 * summariser wrote about a group of pages — true to the material, but one
 * remove from it, and with nothing to check it against. It answers "what is in
 * here", which claims cannot, and it must never be used to answer "is X true".
 */
export interface WorkspaceTheme {
  title: string;
  summary: string;
  nodeCount: number;
  pageCount: number;
}

export interface CopilotAnswer {
  answer: string;
  citations: { claimId: string; pageSlug: string; pageTitle: string }[];
  /** True when the workspace held nothing relevant and the model declined. */
  refused: boolean;
}

export const copilotAgent = new Agent({
  id: "copilot",
  name: "Copilot",
  description: "Answers questions using only the workspace's compiled knowledge.",
  model: config.model,
  instructions: `You answer questions about a person's own compiled knowledge base.

You are given a set of CLAIMS retrieved from that knowledge base. Each carries an
id, the page it lives on, and the verbatim quote from the original source.

Rules, in order of importance:

1. Answer ONLY from the claims provided. You have no other knowledge available
   for this task. If the claims do not answer the question, say so plainly and
   name what is missing — a wrong answer is far worse than "your notes don't
   cover this", because the whole point of this product is that answers are
   checkable.

2. Cite. After each statement, reference the claim ids it rests on like [c1],
   [c2], matching the labels given to you. Never cite a claim you did not use,
   and never state something no claim supports.

3. When claims marked 'disputed' bear on the question, say so explicitly and
   present both sides. Do not quietly pick a winner — the reader saved both
   sources and is entitled to know they disagree.

4. Write plainly, in the reader's own register. This is their material; do not
   lecture them about it, and do not pad with "based on your knowledge base"
   preambles. Answer the question.

5. Never speculate beyond the claims, even when the answer seems obvious. If you
   find yourself reaching for general knowledge, that is the signal to refuse.

6. You may also be given THEMES: the areas this knowledge base covers, named by
   grouping its pages. Themes are a map, not evidence. Use them to say what the
   collection contains, to point at the nearest area when the claims fall short,
   and to answer questions about the shape of the reader's own reading. Never
   cite a theme, and never state a fact on a theme's authority — if the claims
   do not support it, it is not supported, however plainly a theme implies it.`,
});

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * A follow-up shorter than this is treated as leaning on what came before.
 *
 * "Why?" and "what about the other one" carry almost no searchable text, so
 * retrieving on them alone returns nothing and the copilot refuses a question it
 * could actually answer.
 */
const FOLLOW_UP_CHARS = 40;

/**
 * What to search the knowledge base for.
 *
 * Query rewriting with the model would be more precise, but it costs a call per
 * turn to fix a case a length check catches: a genuinely new question in an open
 * thread is stated in full, and a follow-up is not. So the previous question is
 * folded in only for the short ones, where retrieval would otherwise come back
 * empty.
 */
export function searchQuery(question: string, history: HistoryTurn[] = []): string {
  const trimmed = question.trim();
  if (trimmed.length >= FOLLOW_UP_CHARS) return trimmed;

  const previous = [...history].reverse().find((turn) => turn.role === "user");
  return previous ? `${previous.content.trim()} ${trimmed}` : trimmed;
}

/** The workspace's areas, as a compact map. Empty string when there are none. */
function themeMap(themes: WorkspaceTheme[]): string {
  if (themes.length === 0) return "";
  return `THEMES (what this knowledge base covers — a map, not evidence; never cite these):\n${themes
    .map((theme) => `- ${theme.title} (${theme.pageCount} pages): ${theme.summary}`)
    .join("\n")}`;
}

/** Prompt for one turn: the question, the thread so far, and the evidence. */
export function buildCopilotPrompt(
  question: string,
  claims: RetrievedClaim[],
  history: HistoryTurn[] = [],
  themes: WorkspaceTheme[] = [],
): string {
  if (claims.length === 0) {
    // Retrieval found nothing, but the workspace is not necessarily empty — the
    // question may be about its shape rather than about a fact in it. With the
    // map in hand the model can answer that, or name the nearest area it does
    // cover, instead of the flat "nothing here" this used to return.
    return [
      `Question: ${question}`,
      "CLAIMS: (none matched this question)",
      themeMap(themes),
      themes.length > 0
        ? "No claim matched. If the question is about what this knowledge base covers, answer it from the themes. Otherwise say plainly that the notes do not cover this, and name the closest areas that exist. Do not answer the question itself from a theme."
        : "Tell the reader their notes do not cover this yet.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const evidence = claims
    .map((claim, i) => {
      const label = `c${i + 1}`;
      const disputed = claim.status === "disputed" ? " [DISPUTED]" : "";
      const source = claim.sourceTitle ? ` — source: ${claim.sourceTitle}` : "";
      return [
        `[${label}] (page: ${claim.pageTitle})${disputed}`,
        `  claim: ${claim.text}`,
        claim.quote ? `  quote: "${claim.quote}"${source}` : `  (no quote recorded)${source}`,
      ].join("\n");
    })
    .join("\n\n");

  // Earlier turns tell the model what a follow-up refers to. Capped, because a
  // long thread would crowd out the evidence the answer must actually rest on —
  // history is context, not a second source of truth.
  const thread = history
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "Reader" : "You"}: ${turn.content}`)
    .join("\n\n");

  return [
    thread && `CONVERSATION SO FAR:\n${thread}`,
    `Question: ${question}`,
    themeMap(themes),
    `CLAIMS:\n${evidence}`,
    "Answer using only these claims, citing the labels. Earlier turns tell you what the question refers to; they are not evidence, and neither are the themes.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Maps the labels the model cited back to real claim ids for the UI.
 *
 * Handles the several shapes models actually produce, not just the one the
 * prompt asks for: `[c1]`, `[c1, c2]`, `[c1,c2]`, and `[c1][c2]`. Parsing only
 * the single form undercounted grouped citations, which made a well-grounded
 * answer look like it rested on one claim.
 */
export function resolveCitations(
  answer: string,
  claims: RetrievedClaim[],
): CopilotAnswer["citations"] {
  const indices = new Set<number>();

  // Each bracketed group may hold several labels.
  for (const group of answer.matchAll(/\[([^\]]*?c\d+[^\]]*?)\]/g)) {
    for (const label of group[1]!.matchAll(/c(\d+)/g)) {
      indices.add(Number(label[1]) - 1);
    }
  }

  return [...indices]
    .sort((a, b) => a - b)
    .filter((i) => i >= 0 && i < claims.length)
    .map((i) => ({
      claimId: claims[i]!.claimId,
      pageSlug: claims[i]!.pageSlug,
      pageTitle: claims[i]!.pageTitle,
    }));
}
