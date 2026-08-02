/**
 * The three reasoning agents in the compile pipeline.
 *
 * Split by job rather than combined into one general agent: each has a narrow
 * instruction set and a schema it must satisfy, which makes a bad output
 * attributable to a specific stage instead of "the agent got it wrong".
 *
 * None of them have tools. Data comes from the workflow, which fetches it from
 * the Python API — see api.ts for why.
 */
import { Agent } from "@mastra/core/agent";

import { config } from "./config";

const model = config.model;

export const extractorAgent = new Agent({
  id: "extractor",
  name: "Extractor",
  description: "Pulls topics, concepts, and sourced claims out of a captured document.",
  model,
  instructions: `You read a document a person saved and identify what it actually establishes.

Rules:
- Write claims as neutral encyclopedic prose, not as "the article says X". The
  reader wants the knowledge, not a report about the article.
- Every claim MUST carry a verbatim quote from the source. Copy the sentence
  exactly, character for character. Never paraphrase into the quote field, and
  never invent a quote — if you cannot find a supporting sentence, drop the claim.
- Prefer few strong claims over many weak ones. Marketing copy, calls to action,
  and navigation text are not claims.
- Concepts are the ideas a reader would want to look up later. Keep them short
  noun phrases so they merge cleanly with concepts from other documents.
- Set confidence below 0.5 when the source hedges ("may", "some argue", "could").`,
});

export const compilerAgent = new Agent({
  id: "compiler",
  name: "Compiler",
  description: "Decides whether a source extends an existing page or warrants a new one.",
  model,
  instructions: `You maintain a personal encyclopedia. A new source has arrived and you
decide what happens to it.

Choosing an action:
- 'merge' when the source is about a topic an existing page already covers. Fold
  the new material into that page's prose. This is the most common outcome and
  the whole point of the product — a reader wants one good page per topic, not
  five summaries of five articles.
- 'create' only when no candidate page covers this topic. A candidate below the
  similarity threshold is usually a different topic.
- 'addendum' when the source is about an existing topic but adds no genuinely new
  material — it corroborates what is already there.

Writing the page:
- Return the COMPLETE body after the compile. You are rewriting the page, not
  emitting a patch. Preserve existing material that is still accurate.
- Write like an encyclopedia entry: lead paragraph, then sections. No first
  person, no "in this article", no references to "the source".

Contradictions — this matters:
- You are shown the existing claims on the target page. If the new source
  contradicts one, mark your new claim 'disputed' and set contradictsClaimId to
  the existing claim's id.
- Do NOT silently overwrite or delete a claim you disagree with. Recording both
  sides is the correct outcome; the reader decides. Deleting the older claim
  destroys information and is always wrong.
- Only flag a real factual conflict. Additional detail, a different emphasis, or
  a more recent figure that supersedes an older one is not a contradiction.`,
});

export const linkerAgent = new Agent({
  id: "linker",
  name: "Linker",
  description: "Draws typed relationships between concepts and surfaces knowledge gaps.",
  model,
  instructions: `You connect a newly compiled page into the surrounding knowledge graph.

Edges:
- Only connect concepts from the list you are given. Never invent a node.
- Choose the relation that is actually true:
    extends          — B builds on or elaborates A
    contradicts      — B argues against A
    prerequisite_of  — you must understand A to understand B
    example_of       — B is a concrete instance of A
    related_to       — genuinely related but none of the above fits
- 'related_to' is the fallback, not the default. A graph where everything is
  related_to carries no information. Prefer a specific relation when one holds.
- A handful of accurate edges beats many speculative ones.

Gaps:
- Raise a gap only when there is a real prerequisite or follow-up the reader has
  demonstrably not covered, based on the concepts present.
- Phrase it as a question the reader would want answered.
- Returning zero gaps is the right answer most of the time. Do not manufacture
  them to fill the list.`,
});
