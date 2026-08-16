import { describe, expect, test } from "vitest";
import { isInternalPath } from "@/features/agent/citation-markdown";

/**
 * What counts as "a page in this workspace".
 *
 * This decides which links skip Streamdown's leaving-the-site prompt, so the
 * interesting cases are the ones that look like a path and are not.
 */
describe("isInternalPath", () => {
	test("accepts a compiled page's own path", () => {
		expect(isInternalPath("/artificial-intelligence-engineering")).toBe(true);
		expect(isInternalPath("/")).toBe(true);
		expect(isInternalPath("/agent/abc-123")).toBe(true);
	});

	test("refuses a protocol-relative URL to another host", () => {
		// Reads as a path at a glance and is not one — //evil.example loads
		// evil.example over the current scheme.
		expect(isInternalPath("//evil.example")).toBe(false);
		expect(isInternalPath("//evil.example/looks/like/a/page")).toBe(false);
	});

	test("refuses a backslash the browser may normalise to a slash", () => {
		expect(isInternalPath("/\\evil.example")).toBe(false);
	});

	test("refuses absolute URLs, whatever the scheme", () => {
		expect(isInternalPath("https://example.com/page")).toBe(false);
		expect(isInternalPath("http://example.com")).toBe(false);
		expect(isInternalPath("javascript:alert(1)")).toBe(false);
		expect(isInternalPath("data:text/html,hi")).toBe(false);
		expect(isInternalPath("mailto:someone@example.com")).toBe(false);
	});

	test("refuses relative and empty forms that name no page", () => {
		expect(isInternalPath("")).toBe(false);
		expect(isInternalPath("slug")).toBe(false);
		expect(isInternalPath("./slug")).toBe(false);
		expect(isInternalPath("../slug")).toBe(false);
		expect(isInternalPath("#section")).toBe(false);
	});
});
