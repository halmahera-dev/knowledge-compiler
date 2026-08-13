/**
 * What an error page says.
 *
 * The rule that matters is negative: the stack never reaches the reader. The
 * rest is about being specific enough to act on — "an error occurred" sends
 * someone to the wrong place, and in this app the right place is almost always
 * "a service is not running".
 */
import { describe, expect, it } from "vitest";

import { describeError } from "./describe-error";

describe("describeError", () => {
	it("names the likely cause for a failed fetch", () => {
		expect(describeError(new TypeError("Failed to fetch"))).toMatch(
			/pnpm dev/,
		);
	});

	it("recognises a refused connection, which is what a dead API looks like", () => {
		expect(describeError(new Error("connect ECONNREFUSED 127.0.0.1:8000"))).toMatch(
			/did not respond/,
		);
	});

	it("passes an ordinary message through unchanged", () => {
		expect(describeError(new Error("revision 4 does not exist"))).toBe(
			"revision 4 does not exist",
		);
	});

	it("never returns the stack", () => {
		const error = new Error("boom");
		error.stack = "Error: boom\n    at secretModule (/srv/app/secret.ts:12:9)";
		expect(describeError(error)).toBe("boom");
		expect(describeError(error)).not.toMatch(/secret/);
	});

	it("falls back when the message is empty or the value is not an error", () => {
		for (const value of [new Error(""), null, undefined, "   "]) {
			expect(describeError(value)).toBe(
				"Something failed while loading this page.",
			);
		}
	});
});
