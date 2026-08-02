/**
 * Shared contract between the web app, the Mastra agent, and the extension.
 *
 * These zod schemas are the single source of truth for the agent's structured
 * outputs — each LLM step is forced to conform to one of them, so a malformed
 * model response is caught at the step boundary instead of corrupting the graph.
 * The Python API mirrors these as Pydantic models; `pnpm contracts:gen` checks
 * the two stay in sync against FastAPI's OpenAPI document.
 */
import { z } from "zod";

// ─── primitives ──────────────────────────────────────────────────────────────

export const captureTypeSchema = z.enum(["paste", "clip", "link"]);
export type CaptureType = z.infer<typeof captureTypeSchema>;

export const claimStatusSchema = z.enum(["asserted", "disputed", "superseded"]);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

export const edgeRelationSchema = z.enum([
  "extends",
  "contradicts",
  "prerequisite_of",
  "example_of",
  "related_to",
]);
export type EdgeRelation = z.infer<typeof edgeRelationSchema>;

export const runStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

// ─── step 1: extract ─────────────────────────────────────────────────────────

/**
 * A single factual statement lifted from a source, carrying the verbatim span it
 * came from. Provenance is captured at extraction time — reconstructing "which
 * sentence supports this" after the fact is unreliable.
 */
export const extractedClaimSchema = z.object({
  text: z.string().describe("A single self-contained factual statement, in your own words."),
  quote: z
    .string()
    .describe("The verbatim sentence from the source that supports this claim. Copy exactly."),
  section: z.string().describe("Short section heading this claim belongs under."),
  confidence: z.number().min(0).max(1).describe("How firmly the source asserts this."),
});
export type ExtractedClaim = z.infer<typeof extractedClaimSchema>;

export const extractionSchema = z.object({
  title: z.string().describe("A concise encyclopedia-style title for the main topic."),
  topic: z.string().describe("The single primary topic, as a noun phrase. This becomes a page."),
  summary: z.string().describe("Two or three sentences summarizing the source."),
  concepts: z
    .array(z.string())
    .max(12)
    .describe("Distinct concepts discussed. These become graph nodes."),
  entities: z
    .array(z.string())
    .max(12)
    .describe("Named people, organizations, products, or places."),
  claims: z.array(extractedClaimSchema).max(20).describe("The substantive claims made."),
});
export type Extraction = z.infer<typeof extractionSchema>;

// ─── step 2: match ───────────────────────────────────────────────────────────

export const pageCandidateSchema = z.object({
  pageId: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  similarity: z.number(),
});
export type PageCandidate = z.infer<typeof pageCandidateSchema>;

// ─── step 3: compile ─────────────────────────────────────────────────────────

/**
 * `merge` folds into an existing page; `create` opens a new one. `addendum` is a
 * merge that adds no new sections — a minor contribution to a page that already
 * covers the ground (PRD §6.2).
 */
export const compileActionSchema = z.enum(["create", "merge", "addendum"]);
export type CompileAction = z.infer<typeof compileActionSchema>;

export const compiledClaimSchema = z.object({
  text: z.string(),
  quote: z.string(),
  section: z.string(),
  confidence: z.number().min(0).max(1),
  status: claimStatusSchema.describe(
    "Mark 'disputed' when this claim conflicts with an existing claim on the page.",
  ),
  contradictsClaimId: z
    .string()
    .nullable()
    .describe("Id of the existing claim this contradicts, when status is 'disputed'."),
});
export type CompiledClaim = z.infer<typeof compiledClaimSchema>;

export const compilationSchema = z.object({
  action: compileActionSchema,
  targetPageId: z
    .string()
    .nullable()
    .describe("The page being merged into. Null when action is 'create'."),
  title: z.string(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase words joined by single hyphens"),
  summary: z.string(),
  sections: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .describe("The full page body after this compile, not just the additions."),
  claims: z.array(compiledClaimSchema),
  reasoning: z.string().describe("One sentence: why this action, for the activity feed."),
});
export type Compilation = z.infer<typeof compilationSchema>;

// ─── step 4: link ────────────────────────────────────────────────────────────

export const proposedEdgeSchema = z.object({
  source: z.string().describe("Label of the source node."),
  target: z.string().describe("Label of the target node."),
  relation: edgeRelationSchema,
  weight: z.number().min(0).max(1),
});
export type ProposedEdge = z.infer<typeof proposedEdgeSchema>;

export const proposedGapSchema = z.object({
  question: z.string().describe("An open question the knowledge base cannot yet answer."),
  reason: z.string().describe("Why this gap matters given what has been read."),
  relatedTo: z.string().describe("Label of the node this gap hangs off."),
});
export type ProposedGap = z.infer<typeof proposedGapSchema>;

export const linkageSchema = z.object({
  edges: z.array(proposedEdgeSchema).max(20),
  gaps: z.array(proposedGapSchema).max(5),
});
export type Linkage = z.infer<typeof linkageSchema>;

// ─── the compile diff ────────────────────────────────────────────────────────

/**
 * What the agent actually changed. This is the product's core differentiator —
 * the compile step is shown, not hidden, so the user can see (and undo) exactly
 * what happened to their knowledge base on every save.
 */
export const compileDiffSchema = z.object({
  runId: z.string(),
  rawItemId: z.string(),
  action: compileActionSchema,
  page: z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    revisionNo: z.number().int(),
  }),
  claimsAdded: z.number().int(),
  claimsDisputed: z.number().int(),
  sectionsAdded: z.array(z.string()),
  nodesCreated: z.array(z.string()),
  edgesCreated: z.array(
    z.object({ source: z.string(), target: z.string(), relation: edgeRelationSchema }),
  ),
  gapsRaised: z.array(z.string()),
  reasoning: z.string(),
});
export type CompileDiff = z.infer<typeof compileDiffSchema>;

// ─── SSE events ──────────────────────────────────────────────────────────────

/**
 * Emitted over `GET /api/v1/stream` as a compile progresses, so the activity feed
 * shows the pipeline working rather than a spinner that resolves all at once.
 */
export const compileEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run.started"),
    runId: z.string(),
    rawItemId: z.string(),
    title: z.string().nullable(),
  }),
  z.object({
    type: z.literal("run.step"),
    runId: z.string(),
    step: z.enum(["extract", "match", "compile", "link", "persist"]),
    detail: z.string(),
  }),
  z.object({ type: z.literal("run.succeeded"), runId: z.string(), diff: compileDiffSchema }),
  z.object({ type: z.literal("run.failed"), runId: z.string(), error: z.string() }),
]);
export type CompileEvent = z.infer<typeof compileEventSchema>;

// ─── API request/response shapes ─────────────────────────────────────────────

export const createItemRequestSchema = z
  .object({
    captureType: captureTypeSchema,
    content: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    title: z.string().optional(),
  })
  .refine((v) => (v.captureType === "link" ? !!v.sourceUrl : !!v.content), {
    message: "link captures need sourceUrl; paste and clip captures need content",
  });
export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;

export const createItemResponseSchema = z.object({
  itemId: z.string(),
  runId: z.string(),
  status: runStatusSchema,
  duplicate: z.boolean().describe("True when this content was already saved; nothing was queued."),
});
export type CreateItemResponse = z.infer<typeof createItemResponseSchema>;

export const graphResponseSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      kind: z.enum(["topic", "entity"]),
      weight: z.number(),
      slug: z.string().nullable(),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      relation: edgeRelationSchema,
      weight: z.number(),
    }),
  ),
});
export type GraphResponse = z.infer<typeof graphResponseSchema>;
