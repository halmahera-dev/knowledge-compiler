/**
 * Redirect-target validation.
 *
 * This runs on a value taken straight from the query string and handed to the
 * router immediately after someone types their password — the single best moment
 * for an open redirect to be worth something. The rule is an allowlist of "paths
 * on this app", so anything that could resolve to another origin must be refused
 * rather than sanitised.
 */
import { describe, expect, it } from "vitest";

import { safeRedirect } from "./guards";

describe("safeRedirect", () => {
  it("keeps an ordinary in-app path", () => {
    expect(safeRedirect("/wiki/post-training-quantisation")).toBe(
      "/wiki/post-training-quantisation",
    );
  });

  it("keeps a path with a query string, so deep links survive the detour", () => {
    expect(safeRedirect("/wiki?q=embeddings")).toBe("/wiki?q=embeddings");
  });

  it("refuses an absolute http URL", () => {
    expect(safeRedirect("https://evil.example/steal")).toBe("/capture");
  });

  it("refuses a protocol-relative URL, which browsers treat as absolute", () => {
    // The one that slips past a naive "starts with /" check.
    expect(safeRedirect("//evil.example/steal")).toBe("/capture");
  });

  it("refuses a backslash-escaped authority, which some parsers normalise to //", () => {
    expect(safeRedirect("/\\evil.example")).toBe("/capture");
  });

  it("refuses a javascript: URL", () => {
    expect(safeRedirect("javascript:alert(1)")).toBe("/capture");
  });

  it("refuses a bare host with no leading slash", () => {
    expect(safeRedirect("evil.example")).toBe("/capture");
  });

  it("falls back when the parameter is missing or not a string", () => {
    for (const value of [undefined, null, 42, {}, [], true]) {
      expect(safeRedirect(value)).toBe("/capture");
    }
  });

  it("honours a caller-supplied fallback", () => {
    expect(safeRedirect("https://evil.example", "/")).toBe("/");
  });
});
