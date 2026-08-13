/**
 * Keyboard navigation for tab strips.
 *
 * These exist because `role="tab"` is a promise to assistive tech that arrow
 * keys work, and the first implementation quietly broke that promise for the
 * landing page's stage strip — see the numeric-id cases below.
 */
import { describe, expect, it } from "vitest";

import { nextTabId } from "./use-tablist";

const MODES = ["paste", "link", "clip", "pdf"] as const;
const STAGES = [0, 1, 2] as const;

describe("nextTabId", () => {
  describe("string ids", () => {
    it("moves forward on ArrowRight", () => {
      expect(nextTabId(MODES, "paste", "ArrowRight")).toBe("link");
    });

    it("moves back on ArrowLeft", () => {
      expect(nextTabId(MODES, "clip", "ArrowLeft")).toBe("link");
    });

    it("wraps past the last tab rather than stopping", () => {
      expect(nextTabId(MODES, "pdf", "ArrowRight")).toBe("paste");
    });

    it("wraps before the first tab", () => {
      expect(nextTabId(MODES, "paste", "ArrowLeft")).toBe("pdf");
    });

    it("jumps to the ends with Home and End", () => {
      expect(nextTabId(MODES, "clip", "Home")).toBe("paste");
      expect(nextTabId(MODES, "clip", "End")).toBe("pdf");
    });

    it("treats vertical arrows as equivalent, for strips rendered as columns", () => {
      expect(nextTabId(MODES, "paste", "ArrowDown")).toBe("link");
      expect(nextTabId(MODES, "link", "ArrowUp")).toBe("paste");
    });
  });

  describe("numeric ids", () => {
    // The regression. A falsy check on the result silently swallowed every move
    // that landed on id 0, so the stage strip could never reach its first tab.
    it("wraps to a zero id on ArrowRight", () => {
      expect(nextTabId(STAGES, 2, "ArrowRight")).toBe(0);
    });

    it("reaches a zero id with Home", () => {
      expect(nextTabId(STAGES, 2, "Home")).toBe(0);
    });

    it("reaches a zero id by wrapping backwards", () => {
      expect(nextTabId(STAGES, 1, "ArrowLeft")).toBe(0);
    });
  });

  describe("keys and states it must not act on", () => {
    it("returns undefined for unrelated keys, so typing still reaches the page", () => {
      for (const key of ["Enter", " ", "a", "Escape", "Tab", "PageDown"]) {
        expect(nextTabId(MODES, "paste", key)).toBeUndefined();
      }
    });

    it("returns undefined when the active id is not in the list", () => {
      // Guards against preventDefault-ing a key press and then moving nowhere.
      expect(nextTabId(MODES, "gone" as (typeof MODES)[number], "ArrowRight")).toBeUndefined();
    });

    it("returns undefined for an empty strip", () => {
      expect(nextTabId([] as readonly string[], "paste", "ArrowRight")).toBeUndefined();
    });
  });

  it("returns to where it started after a full cycle", () => {
    let id: (typeof MODES)[number] = "paste";
    for (let i = 0; i < MODES.length; i++) {
      id = nextTabId(MODES, id, "ArrowRight")!;
    }
    expect(id).toBe("paste");
  });
});
