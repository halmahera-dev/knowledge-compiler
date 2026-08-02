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

import { resolveCitations, type RetrievedClaim } from "./copilot";

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
