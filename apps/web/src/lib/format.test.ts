/**
 * Display strings.
 *
 * Each of these is trivial and each has been wrong once in a way only a human
 * noticed — a 4KB file reported as "0.0 MB", eighty characters of prose read
 * aloud as a status announcement. They are cheap to pin, so they are pinned.
 */
import { describe, expect, it } from "vitest";

import type { CompileDiff } from "./api";
import { announce, formatSize, sentence, spokenTitle } from "./format";

function diff(over: Partial<CompileDiff> = {}): CompileDiff {
  return {
    runId: "r",
    rawItemId: "i",
    action: "create",
    page: { id: "p", slug: "s", title: "Post-training quantisation", revisionNo: 1 },
    claimsAdded: 3,
    claimsDisputed: 0,
    sectionsAdded: [],
    nodesCreated: [],
    edgesCreated: [],
    gapsRaised: [],
    reasoning: "",
    ...over,
  };
}

describe("formatSize", () => {
  it("reports small files in KB rather than as 0.0 MB", () => {
    // The regression: a 4KB PDF used to render "0.0 MB", which reads as broken.
    expect(formatSize(4075)).toBe("4 KB");
  });

  it("never reports 0 KB for a non-empty file", () => {
    expect(formatSize(1)).toBe("1 KB");
  });

  it("switches to MB at a megabyte", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatSize(40 * 1024 * 1024)).toBe("40.0 MB");
  });

  it("keeps one decimal place in MB", () => {
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});

describe("spokenTitle", () => {
  it("leaves a real title alone", () => {
    expect(spokenTitle("Post-training quantisation")).toBe("Post-training quantisation");
  });

  it("shortens a derived excerpt instead of reading it all aloud", () => {
    const excerpt =
      "Speculative decoding drafts several tokens with a small model and verifies them in one pass";
    const spoken = spokenTitle(excerpt);
    expect(spoken.length).toBeLessThanOrEqual(50);
    expect(spoken.endsWith("…")).toBe(true);
  });

  it("cuts on a word boundary — a half-word is worse spoken than seen", () => {
    const original =
      "Speculative decoding drafts several tokens with a small model and verifies them";
    const kept = spokenTitle(original).replace(/…$/, "");

    // The kept text is a prefix of the original, and the original continues with
    // a space — which is what makes it a whole-word cut rather than a mid-word one.
    expect(original.startsWith(kept)).toBe(true);
    expect(original[kept.length]).toBe(" ");
    expect(kept.endsWith(" ")).toBe(false);
  });

  it("drops a trailing ellipsis the server already added", () => {
    expect(spokenTitle("A short title…")).toBe("A short title");
  });

  it("falls back for a missing or blank title", () => {
    expect(spokenTitle(null)).toBe("a saved item");
    expect(spokenTitle("   ")).toBe("a saved item");
  });

  it("still truncates when the text has no spaces to cut on", () => {
    const spoken = spokenTitle("x".repeat(120));
    expect(spoken.length).toBeLessThanOrEqual(50);
    expect(spoken.endsWith("…")).toBe(true);
  });
});

describe("sentence", () => {
  it("adds a full stop when there is none", () => {
    expect(sentence("Compiling a page")).toBe("Compiling a page.");
  });

  it("does not double up after an ellipsis", () => {
    // The stumble: "…." was being read out as a broken pause.
    expect(sentence("Compiling Grouped-query attention shares…")).toBe(
      "Compiling Grouped-query attention shares…",
    );
  });

  it("leaves other terminators alone", () => {
    expect(sentence("Done.")).toBe("Done.");
    expect(sentence("Really?")).toBe("Really?");
  });
});

describe("announce", () => {
  it("names the action so a new page is distinguishable from a merge", () => {
    expect(announce(diff({ action: "create" }))).toContain("Created");
    expect(announce(diff({ action: "merge" }))).toContain("Merged into");
    expect(announce(diff({ action: "addendum" }))).toContain("Added to");
  });

  it("reports the claim count", () => {
    expect(announce(diff({ claimsAdded: 3 }))).toContain("3 claims added");
  });

  it("mentions disputes, which are the part worth interrupting for", () => {
    expect(announce(diff({ claimsDisputed: 2 }))).toContain("2 disputed");
  });

  it("stays silent about disputes when there are none", () => {
    expect(announce(diff({ claimsDisputed: 0 }))).not.toContain("disputed");
  });

  it("shortens a long page title the same way", () => {
    const long = "A page title that runs on well past what anyone wants read aloud to them";
    expect(announce(diff({ page: { id: "p", slug: "s", title: long, revisionNo: 1 } }))).toContain(
      "…",
    );
  });
});
