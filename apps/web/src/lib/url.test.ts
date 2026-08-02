/**
 * Source URLs.
 *
 * The bug these were written against: an uploaded PDF stores its object-storage
 * key as the source URL, and that key was rendered straight into an `href`. Every
 * PDF-sourced page carried a dead `s3://` link whose text was the workspace id
 * and internal path.
 *
 * The scheme check is an allowlist, so the cases below are less about the ones
 * named and more about the shape: anything that is not a web address is refused.
 */
import { describe, expect, it } from "vitest";

import { safeHref, sourceLabel } from "./url";

describe("safeHref", () => {
  it("passes an ordinary web address through", () => {
    expect(safeHref("https://arxiv.org/abs/2208.07339")).toBe(
      "https://arxiv.org/abs/2208.07339",
    );
    expect(safeHref("http://example.com/a")).toBe("http://example.com/a");
  });

  it("trims surrounding whitespace rather than refusing over it", () => {
    expect(safeHref("  https://example.com/a  ")).toBe("https://example.com/a");
  });

  it("refuses an object-storage key", () => {
    // The regression: this was becoming a link on every PDF-sourced page.
    expect(safeHref("s3://knowledge-compiler/ws_abc/9f2c.pdf")).toBeUndefined();
  });

  it("refuses javascript: and data: URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeUndefined();
  });

  it("refuses a scheme that merely starts with http", () => {
    // `httpx://` and friends must not slip through a prefix check.
    expect(safeHref("httpx://example.com")).toBeUndefined();
  });

  it("refuses file: and mailto:", () => {
    expect(safeHref("file:///etc/passwd")).toBeUndefined();
    expect(safeHref("mailto:someone@example.com")).toBeUndefined();
  });

  it("refuses a bare host with no scheme", () => {
    expect(safeHref("example.com/a")).toBeUndefined();
  });

  it("refuses empty, blank, null and undefined", () => {
    for (const value of ["", "   ", null, undefined]) {
      expect(safeHref(value)).toBeUndefined();
    }
  });
});

describe("sourceLabel", () => {
  it("prefers the title, which is what the reader recognises", () => {
    expect(sourceLabel("LLM.int8()", "https://arxiv.org/abs/2208.07339")).toBe("LLM.int8()");
  });

  it("falls back to the URL when there is no title", () => {
    expect(sourceLabel(null, "https://example.com/a")).toBe("https://example.com/a");
  });

  it("never prints an object-storage key as the label", () => {
    // Printing it would leak the workspace id and internal path into the page.
    expect(sourceLabel(null, "s3://knowledge-compiler/ws_abc/9f2c.pdf")).toBe(
      "Pasted excerpt",
    );
  });

  it("uses the caller's fallback wording", () => {
    expect(sourceLabel(null, null, "pasted excerpt")).toBe("pasted excerpt");
  });

  it("treats a blank title as absent", () => {
    expect(sourceLabel("   ", "https://example.com/a")).toBe("https://example.com/a");
  });
});
