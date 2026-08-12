/**
 * Citation resolution.
 *
 * The copilot's whole claim is that every sentence is checkable, and this is the
 * step that turns the model's `[c2]` labels back into claims the reader can open.
 * It already shipped one bug: only single labels were parsed, so an answer that
 * grouped its citations as `[c2, c3]` — a shape the model produces unprompted —
 * resolved to one citation and looked far less grounded than it was.
 */
import { describe, expect, it } from "vitest";

import { buildCopilotPrompt, resolveCitations, type RetrievedClaim } from "./copilot";

function claim(n: number): RetrievedClaim {
  return {
    claimId: `id-${n}`,
    text: `claim ${n}`,
    section: "s",
    status: "asserted",
    pageSlug: `page-${n}`,
    pageTitle: `Page ${n}`,
    quote: "q",
    sourceTitle: null,
    sourceUrl: null,
  };
}

const CLAIMS = [claim(1), claim(2), claim(3), claim(4)];
const ids = (answer: string) => resolveCitations(answer, CLAIMS).map((c) => c.claimId);

describe("resolveCitations", () => {
  it("resolves a single label to its claim", () => {
    expect(ids("Weights are quantised [c1].")).toEqual(["id-1"]);
  });

  it("resolves labels grouped in one bracket", () => {
    // The regression: this used to yield a single citation.
    expect(ids("Outliers dominate [c2, c3].")).toEqual(["id-2", "id-3"]);
  });

  it("resolves a group written without spaces", () => {
    expect(ids("Outliers dominate [c2,c3].")).toEqual(["id-2", "id-3"]);
  });

  it("resolves adjacent brackets", () => {
    expect(ids("Outliers dominate [c2][c3].")).toEqual(["id-2", "id-3"]);
  });

  it("returns citations in claim order, not the order they were written", () => {
    // The list is shown beside the answer, where claim order is what reads well.
    expect(ids("Later [c4] and earlier [c1].")).toEqual(["id-1", "id-4"]);
  });

  it("counts a claim cited twice only once", () => {
    expect(ids("First [c2]. Again [c2].")).toEqual(["id-2"]);
  });

  it("ignores labels beyond the claims actually retrieved", () => {
    // A hallucinated citation must not crash or invent a claim id.
    expect(ids("As shown [c9].")).toEqual([]);
  });

  it("ignores a zero label, which indexes before the first claim", () => {
    expect(ids("As shown [c0].")).toEqual([]);
  });

  it("returns nothing for an answer that cites nothing", () => {
    // This is what marks an answer ungrounded, so it must not silently pass.
    expect(ids("Your notes do not cover this.")).toEqual([]);
  });

  it("does not treat ordinary bracketed prose as a citation", () => {
    expect(ids("The paper [see appendix] says so.")).toEqual([]);
  });

  it("carries the page a claim lives on, so the citation can be opened", () => {
    expect(resolveCitations("Shown [c3].", CLAIMS)).toEqual([
      { claimId: "id-3", pageSlug: "page-3", pageTitle: "Page 3" },
    ]);
  });
});

/**
 * Themes in the prompt.
 *
 * The risk they introduce is precise: theme prose reads like knowledge but has
 * no source quote behind it, so a model that treats it as evidence produces an
 * answer that looks grounded and is not — the one failure this product cannot
 * absorb. These check that the prompt keeps the two apart.
 */
function theme(title: string) {
  return { title, summary: `about ${title}`, nodeCount: 9, pageCount: 3 };
}

describe("buildCopilotPrompt with themes", () => {
  it("marks the theme block as not evidence", () => {
    const prompt = buildCopilotPrompt("what is quantisation?", CLAIMS, [], [theme("Inference")]);
    expect(prompt).toContain("Inference");
    expect(prompt).toMatch(/never cite these/i);
  });

  it("still tells the model to answer from the claims", () => {
    const prompt = buildCopilotPrompt("what is quantisation?", CLAIMS, [], [theme("Inference")]);
    expect(prompt).toContain("Answer using only these claims");
    expect(prompt).toMatch(/neither are the themes/i);
  });

  it("omits the block entirely when nothing has been named yet", () => {
    // A workspace with no summaries must produce the prompt it produced before
    // themes existed — an empty heading would read as "there are no themes",
    // which is a different claim from "none have been named".
    const prompt = buildCopilotPrompt("what is quantisation?", CLAIMS, []);
    expect(prompt).not.toMatch(/THEMES/);
  });

  it("offers the nearest area when retrieval found nothing", () => {
    const prompt = buildCopilotPrompt("what is quantisation?", [], [], [theme("Inference")]);
    expect(prompt).toContain("Inference");
    expect(prompt).toMatch(/closest areas/i);
    // The guard that matters: having a map must not license answering from it.
    expect(prompt).toMatch(/Do not answer the question itself from a theme/i);
  });

  it("falls back to the flat refusal when there is no map either", () => {
    const prompt = buildCopilotPrompt("what is quantisation?", [], []);
    expect(prompt).toMatch(/do not cover this yet/i);
  });
});
