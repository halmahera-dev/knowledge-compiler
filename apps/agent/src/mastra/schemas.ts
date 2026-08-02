/**
 * Schemas the LLM steps are forced to conform to.
 *
 * Mirrors `packages/contracts/src/index.ts`. Kept local rather than imported so
 * the agent binds against the exact zod major Mastra ships with, and so a
 * contract change surfaces as a type error here rather than a runtime shape
 * mismatch mid-compile.
 *
 * `.describe()` is doing real work on every field — it is what the model reads to
 * decide what belongs there, so these read as instructions, not documentation.
 */
import { z } from "zod";

export const claimStatusSchema = z.enum(["asserted", "disputed", "superseded"]);
export const edgeRelationSchema = z.enum([
  "extends",
  "contradicts",
  "prerequisite_of",
  "example_of",
  "related_to",
]);
export const compileActionSchema = z.enum(["create", "merge", "addendum"]);

// ─── step 1: extract ─────────────────────────────────────────────────────────

export const extractionSchema = z.object({
  title: z
    .string()
    .describe("A concise encyclopedia-style title for the main topic. No clickbait, no colons."),
  topic: z
    .string()
    .describe("The single primary topic as a short noun phrase. This becomes a wiki page."),
  summary: z.string().describe("Two or three sentences summarizing what this source establishes."),
  concepts: z
    .array(z.string())
    .max(10)
    .describe("Distinct concepts discussed, as short noun phrases. These become graph nodes."),
  entities: z
    .array(z.string())
    .max(10)
    .describe("Named people, organizations, products, or places mentioned."),
  claims: z
    .array(
      z.object({
        text: z
          .string()
          .describe("One self-contained factual statement, rewritten in neutral encyclopedic prose."),
        quote: z
          .string()
          .describe(
            "The verbatim sentence from the source supporting this claim. Copy it exactly, do not paraphrase.",
          ),
        section: z.string().describe("Short section heading this claim belongs under."),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe("How firmly the source asserts this: hedged language should score lower."),
      }),
    )
    .max(15)
    .describe("The substantive claims the source makes. Skip filler and marketing language."),
});
export type Extraction = z.infer<typeof extractionSchema>;

// ─── step 3: compile ─────────────────────────────────────────────────────────

export const compilationSchema = z.object({
  action: compileActionSchema.describe(
    "'merge' to fold into the target page, 'create' for a genuinely new topic, " +
      "'addendum' when it adds sources but no new sections.",
  ),
  targetPageId: z
    .string()
    .nullable()
    .describe("Id of the page being merged into. Null when action is 'create'."),
  title: z.string().describe("Title of the resulting page."),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .describe("URL slug: lowercase words joined by single hyphens."),
  summary: z.string().describe("The page's lead paragraph after this compile."),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        body: z.string().describe("Encyclopedic prose. Merge new material into existing text."),
      }),
    )
    .describe("The COMPLETE page body after this compile, not just the additions."),
  claims: z
    .array(
      z.object({
        text: z.string(),
        quote: z.string().describe("Verbatim supporting sentence from the new source."),
        section: z.string(),
        confidence: z.number().min(0).max(1),
        status: claimStatusSchema.describe(
          "Use 'disputed' when this claim conflicts with an existing claim on the page.",
        ),
        contradictsClaimId: z
          .string()
          .nullable()
          .describe("Id of the existing claim contradicted, when status is 'disputed'."),
      }),
    )
    .max(15)
    .describe("Only claims contributed by the NEW source. Existing claims are carried over for you."),
  reasoning: z.string().describe("One sentence explaining the action, shown in the activity feed."),
});
export type Compilation = z.infer<typeof compilationSchema>;

// ─── step 4: link ────────────────────────────────────────────────────────────

export const linkageSchema = z.object({
  edges: z
    .array(
      z.object({
        source: z.string().describe("Label of the source node, matching a concept exactly."),
        target: z.string().describe("Label of the target node, matching a concept exactly."),
        relation: edgeRelationSchema,
        weight: z.number().min(0).max(1),
      }),
    )
    .max(15)
    .describe("Typed relationships between the concepts on this page."),
  gaps: z
    .array(
      z.object({
        question: z
          .string()
          .describe("An open question this knowledge base cannot yet answer, phrased as a question."),
        reason: z.string().describe("Why this gap matters given what has been read so far."),
        relatedTo: z.string().describe("Label of the concept this gap hangs off."),
      }),
    )
    .max(3)
    .describe("Prerequisites or follow-ups the reader has not covered. Omit if nothing is missing."),
});
export type Linkage = z.infer<typeof linkageSchema>;
