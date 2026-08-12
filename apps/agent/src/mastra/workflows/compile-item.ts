/**
 * The compile pipeline: extract → match → compile → link → persist (HLD §3.4).
 *
 * Deterministic by construction. The steps and their order are fixed; the model
 * supplies judgement inside each one but never decides what happens next. That is
 * what makes a compile explainable after the fact — every run took the same path,
 * so a bad result is attributable to one stage.
 */
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { compilerAgent, extractorAgent, linkerAgent, summariserAgent } from "../agents";
import {
  applyCompile,
  getPageClaims,
  getRawItem,
  pendingCommunities,
  reportFailure,
  reportStep,
  reportUsage,
  searchSimilarPages,
  storeCommunitySummary,
  type CommunityMaterial,
  type ExistingClaim,
  type ModelUsage,
  type PageCandidate,
} from "../api";
import { config } from "../config";
import {
  communitySummarySchema,
  compilationSchema,
  extractionSchema,
  linkageSchema,
} from "../schemas";

const workflowInput = z.object({
  runId: z.string(),
  rawItemId: z.string(),
  workspaceId: z.string(),
});

/**
 * Each step's shape is declared here rather than derived from the previous
 * step's `outputSchema`: Mastra wraps those in a StandardSchema at the step
 * boundary, so they are no longer chainable zod objects.
 */
const afterExtract = workflowInput.extend({
  extraction: extractionSchema,
  content: z.string(),
  sourceUrl: z.string().nullable(),
});

const candidateSchema = z.object({
  pageId: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  similarity: z.number(),
});

const existingClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  section: z.string(),
  status: z.enum(["asserted", "disputed", "superseded"]),
});

const afterMatch = afterExtract.extend({
  candidates: z.array(candidateSchema),
  threshold: z.number(),
  existingClaims: z.array(existingClaimSchema),
  targetPageId: z.string().nullable(),
  targetBody: z.string(),
});

const afterCompile = afterMatch.extend({ compilation: compilationSchema });
const afterLink = afterCompile.extend({ linkage: linkageSchema });

const workflowOutput = z.object({
  runId: z.string(),
  pageSlug: z.string(),
  action: z.string(),
  applied: z.boolean(),
});

/** Long documents are truncated before reaching the model; the tail of an article is rarely load-bearing. */
const MAX_MODEL_CHARS = 24_000;

/**
 * Runs an agent and validates its output, retrying a bounded number of times.
 *
 * A model that cannot produce the required shape twice will not produce it on the
 * tenth attempt, so this fails fast and preserves the raw output — a compile that
 * failed for a knowable reason is far more useful than one that failed silently.
 */
async function generateStructured<T extends z.ZodType>(
  agent: {
    generate: (
      input: string,
      options: unknown,
    ) => Promise<{ object?: unknown; text?: string; usage?: ModelUsage }>;
  },
  prompt: string,
  schema: T,
  { runId, step }: { runId: string; step: string },
): Promise<z.infer<T>> {
  let lastError = "";
  let lastRaw = "";

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt += 1) {
    let response: { object?: unknown; text?: string; usage?: ModelUsage };
    // Measured per attempt, not per step: a retry is a second call and a second
    // bill, and folding them together hides how much retries actually cost.
    const startedAt = Date.now();
    try {
      response = await agent.generate(prompt, { structuredOutput: { schema } });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await reportUsage({
        operation: step,
        latencyMs: Date.now() - startedAt,
        status: "error",
        error: lastError,
        runId,
      });
      continue;
    }

    await reportUsage({
      operation: step,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
      latencyMs: Date.now() - startedAt,
      runId,
    });

    lastRaw = response.text ?? JSON.stringify(response.object ?? null);
    const parsed = schema.safeParse(response.object);
    if (parsed.success) return parsed.data;

    lastError = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }

  const message = `${step} produced output that did not match its schema after ${
    config.maxRetries + 1
  } attempts — ${lastError}`;
  await reportFailure(runId, message, lastRaw);
  throw new Error(message);
}

// ─── 1. extract ──────────────────────────────────────────────────────────────

const extract = createStep({
  id: "extract",
  inputSchema: workflowInput,
  outputSchema: afterExtract,
  execute: async ({ inputData }) => {
    const { runId, rawItemId } = inputData;
    await reportStep(runId, "extract", "Reading the source");

    const item = await getRawItem(rawItemId);
    const content = item.content.slice(0, MAX_MODEL_CHARS);

    const extraction = await generateStructured(
      extractorAgent,
      [
        item.title ? `Title: ${item.title}` : "",
        item.sourceUrl ? `Source: ${item.sourceUrl}` : "",
        "",
        "Document:",
        content,
      ]
        .filter(Boolean)
        .join("\n"),
      extractionSchema,
      { runId, step: "extract" },
    );

    await reportStep(
      runId,
      "extract",
      `Found ${extraction.claims.length} claims across ${extraction.concepts.length} concepts`,
    );

    return { ...inputData, extraction, content, sourceUrl: item.sourceUrl };
  },
});

// ─── 2. match ────────────────────────────────────────────────────────────────

const match = createStep({
  id: "match",
  inputSchema: afterExtract,
  outputSchema: afterMatch,
  execute: async ({ inputData }) => {
    const { runId, extraction } = inputData;
    await reportStep(runId, "match", "Looking for an existing page on this topic");

    const { candidates, threshold } = await searchSimilarPages(
      runId,
      `${extraction.title}\n\n${extraction.summary}`,
    );

    // Only the closest page is a merge candidate, and only above the threshold.
    // Everything else is context for the compiler's decision.
    const best: PageCandidate | undefined =
      candidates[0] && candidates[0].similarity >= threshold ? candidates[0] : undefined;

    let existingClaims: ExistingClaim[] = [];
    let targetBody = "";

    if (best) {
      // Fetching the live claims is what makes contradiction detection possible —
      // without them the compiler has nothing to contradict against.
      const page = await getPageClaims(best.pageId);
      existingClaims = page.claims;
      targetBody = page.sections
        .map((section) => `## ${section.heading}\n${section.body}`)
        .join("\n\n");

      await reportStep(
        runId,
        "match",
        `Matched "${best.title}" at ${(best.similarity * 100).toFixed(0)}% similarity`,
      );
    } else {
      await reportStep(runId, "match", "No existing page is close enough — this is a new topic");
    }

    return {
      ...inputData,
      candidates,
      threshold,
      existingClaims,
      targetPageId: best?.pageId ?? null,
      targetBody,
    };
  },
});

// ─── 3. compile ──────────────────────────────────────────────────────────────

const compile = createStep({
  id: "compile",
  inputSchema: afterMatch,
  outputSchema: afterCompile,
  execute: async ({ inputData }) => {
    const { runId, extraction, candidates, threshold, existingClaims, targetPageId, targetBody } =
      inputData;
    await reportStep(runId, "compile", "Deciding how this fits the knowledge base");

    const candidateList =
      candidates.length > 0
        ? candidates
            .map(
              (c) =>
                `- id=${c.pageId} similarity=${c.similarity.toFixed(3)} "${c.title}" — ${c.summary}`,
            )
            .join("\n")
        : "(none — the knowledge base has no pages on related topics yet)";

    const claimList =
      existingClaims.length > 0
        ? existingClaims
            .map((c) => `- id=${c.id} [${c.status}] (${c.section}) ${c.text}`)
            .join("\n")
        : "(none)";

    const compilation = await generateStructured(
      compilerAgent,
      `New source
-----------
Title: ${extraction.title}
Topic: ${extraction.topic}
Summary: ${extraction.summary}
Concepts: ${extraction.concepts.join(", ") || "(none)"}

Claims extracted from it:
${extraction.claims.map((c) => `- (${c.section}) ${c.text}\n  quote: "${c.quote}"`).join("\n")}

Candidate pages (merge threshold is ${threshold.toFixed(2)})
-----------
${candidateList}

${
  targetPageId
    ? `Target page id=${targetPageId}. Its current body:\n\n${targetBody || "(empty)"}\n\nIts current claims — check each new claim against these for contradictions:\n${claimList}`
    : "No candidate is above the threshold, so this is most likely a new page."
}

Produce the complete compiled page.`,
      compilationSchema,
      { runId, step: "compile" },
    );

    // The model picks the action, but it does not get to invent a merge target.
    // Pinning this to what `match` actually resolved prevents a hallucinated id
    // from writing into an unrelated page.
    const resolved = {
      ...compilation,
      targetPageId: compilation.action === "create" ? null : targetPageId,
      action: compilation.action !== "create" && !targetPageId ? "create" : compilation.action,
    };

    await reportStep(
      runId,
      "compile",
      `${resolved.action === "create" ? "Creating" : "Merging into"} "${resolved.title}"`,
    );

    return { ...inputData, compilation: resolved };
  },
});

// ─── 4. link ─────────────────────────────────────────────────────────────────

const link = createStep({
  id: "link",
  inputSchema: afterCompile,
  outputSchema: afterLink,
  execute: async ({ inputData }) => {
    const { runId, extraction, compilation, candidates, targetPageId } = inputData;
    await reportStep(runId, "link", "Connecting this into the graph");

    // The node labels the API will actually create. Constraining the model to this
    // list is what stops it proposing edges between nodes that do not exist.
    const available = [compilation.title, ...extraction.concepts];

    /*
     * Pages elsewhere in the workspace this document may also link to.
     *
     * Cross-document edges are the ones worth having — a `contradicts` between
     * two things read weeks apart is the argument for compiling rather than
     * retrieving — and until now they were impossible: the API accepted edges
     * only between nodes a single compile established.
     *
     * These are the neighbours the match step already found, so they cost
     * nothing extra and are relevant by construction. The merge target is left
     * out: this compile folds into that page, so an edge to it would have a page
     * extending itself.
     *
     * The list is advisory. The API re-derives its own from the item's stored
     * embedding and accepts nothing outside it, so text injected into a source
     * cannot reach a topic of its choosing by naming one here.
     */
    const existingPages = candidates
      .filter((candidate) => candidate.pageId !== targetPageId)
      .map((candidate) => candidate.title);

    const linkage = await generateStructured(
      linkerAgent,
      `Page: ${compilation.title}
Summary: ${compilation.summary}

Nodes from this document — use these labels EXACTLY:
${available.map((label) => `- ${label}`).join("\n")}
${
  existingPages.length > 0
    ? `
Pages already in this knowledge base, on related topics. You may link to these
too, using their titles EXACTLY. Only where a relationship genuinely holds — a
contradiction or a prerequisite across two sources is worth far more than a vague
"related", and a wrong one is worse than none:
${existingPages.map((title) => `- ${title}`).join("\n")}`
    : ""
}
Draw the typed relationships that genuinely hold between them, and raise any real
knowledge gap this page exposes.`,
      linkageSchema,
      { runId, step: "link" },
    );

    const valid = new Set(
      [...available, ...existingPages].map((label) => label.trim().toLowerCase()),
    );
    const edges = linkage.edges.filter(
      (edge) =>
        valid.has(edge.source.trim().toLowerCase()) &&
        valid.has(edge.target.trim().toLowerCase()) &&
        edge.source.trim().toLowerCase() !== edge.target.trim().toLowerCase(),
    );

    await reportStep(
      runId,
      "link",
      `${edges.length} edges, ${linkage.gaps.length} open question${linkage.gaps.length === 1 ? "" : "s"}`,
    );

    return { ...inputData, linkage: { ...linkage, edges } };
  },
});

// ─── 5. persist ──────────────────────────────────────────────────────────────

const persist = createStep({
  id: "persist",
  inputSchema: afterLink,
  outputSchema: workflowOutput,
  execute: async ({ inputData }) => {
    const { runId, rawItemId, extraction, compilation, linkage } = inputData;
    await reportStep(runId, "persist", "Writing to the knowledge base");

    const diff = await applyCompile({
      runId,
      rawItemId,
      action: compilation.action,
      targetPageId: compilation.targetPageId,
      title: compilation.title,
      slug: compilation.slug,
      summary: compilation.summary,
      sections: compilation.sections,
      claims: compilation.claims.map((claim) => ({
        text: claim.text,
        quote: claim.quote,
        section: claim.section,
        confidence: claim.confidence,
        status: claim.status,
        contradictsClaimId: claim.contradictsClaimId,
      })),
      concepts: extraction.concepts,
      edges: linkage.edges,
      gaps: linkage.gaps,
      reasoning: compilation.reasoning,
    });

    const page = (diff.page ?? {}) as { slug?: string };
    return {
      runId,
      pageSlug: page.slug ?? compilation.slug,
      action: String(diff.action ?? compilation.action),
      applied: true,
    };
  },
});

// ─── 6. name clusters ────────────────────────────────────────────────────────

/**
 * Give the reshaped clusters their names.
 *
 * Runs after persist because it depends on it: applying the compile is what
 * re-runs community detection, so until that has happened there is nothing new
 * to name.
 *
 * Nothing here may fail the run. The page is already written and the graph is
 * already correct by the time this starts — a cluster left unnamed is a missing
 * label on a working knowledge base, and reporting that as a failed compile
 * would be a lie about what happened to the reader's document.
 */
const nameClusters = createStep({
  id: "name-clusters",
  inputSchema: workflowOutput,
  outputSchema: workflowOutput,
  execute: async ({ inputData }) => {
    const { runId } = inputData;

    try {
      const pending = await pendingCommunities(runId);
      if (pending.length === 0) return inputData;

      let named = 0;
      for (const cluster of pending) {
        const summary = await summariseCluster(runId, cluster);
        if (!summary) continue;

        await storeCommunitySummary({
          runId,
          fingerprint: cluster.fingerprint,
          title: summary.title,
          summary: summary.summary,
        });
        named += 1;
      }

      if (named > 0) {
        await reportStep(
          runId,
          "name-clusters",
          named === 1 ? "Named a cluster of the graph" : `Named ${named} clusters of the graph`,
        );
      }
    } catch (error) {
      // Logged, not raised. See the note above.
      console.warn(
        `[name-clusters] skipped for run ${runId}:`,
        error instanceof Error ? error.message : error,
      );
    }

    return inputData;
  },
});

/**
 * One naming call, or null.
 *
 * Deliberately not `generateStructured`: that helper reports a run as FAILED
 * when the model will not produce the schema, which is right for a step the
 * compile depends on and wrong for one that runs after it succeeded. Here a
 * refusal costs a label, so it returns null and the cluster is simply picked up
 * again on the next save.
 */
async function summariseCluster(
  runId: string,
  cluster: CommunityMaterial,
): Promise<{ title: string; summary: string } | null> {
  const pages = cluster.pages
    .map(([title, summary]) => `- ${title}${summary ? `: ${summary}` : ""}`)
    .join("\n");

  const prompt = [
    `This cluster holds ${cluster.nodeCount} concepts across ${cluster.pageCount} compiled pages.`,
    "",
    `CONCEPTS: ${cluster.labels.join(", ")}`,
    pages && `\nPAGES:\n${pages}`,
    "",
    "Name this cluster and say what it covers.",
  ]
    .filter(Boolean)
    .join("\n");

  const startedAt = Date.now();
  try {
    const response = await summariserAgent.generate(prompt, {
      structuredOutput: { schema: communitySummarySchema },
    });

    await reportUsage({
      operation: "name-clusters",
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
      latencyMs: Date.now() - startedAt,
      runId,
    });

    const parsed = communitySummarySchema.safeParse(response.object);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    await reportUsage({
      operation: "name-clusters",
      latencyMs: Date.now() - startedAt,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      runId,
    });
    return null;
  }
}

export const compileItemWorkflow = createWorkflow({
  id: "compile-item",
  description: "Compile one captured item into the wiki and graph.",
  inputSchema: workflowInput,
  outputSchema: workflowOutput,
})
  .then(extract)
  .then(match)
  .then(compile)
  .then(link)
  .then(persist)
  .then(nameClusters)
  .commit();
