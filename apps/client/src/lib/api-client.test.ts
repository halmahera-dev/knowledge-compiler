/**
 * Classifying a signed-out failure.
 *
 * This decides two things a reader sees: whether a query retries, and whether
 * the empty state says "sign in" or "the API did not answer". It used to test
 * `instanceof ApiError`, which quietly excluded the copilot — that feature
 * reaches a second service through its own error class, so its 401s were
 * retried twice and then reported as an outage.
 */
import { describe, expect, it } from "vitest";

import { ApiError, isSignedOut, retryUnlessSignedOut } from "./api-client";

/** Stands in for the copilot's own error class, which has no shared ancestor. */
class ForeignError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ForeignError";
	}
}

describe("isSignedOut", () => {
	it("recognises a 401 from the API client", () => {
		expect(isSignedOut(new ApiError("nope", 401))).toBe(true);
	});

	it("recognises a 401 from another service's error class", () => {
		// The regression: this was false, so the copilot never showed a sign-in
		// prompt and retried a hopeless request twice first.
		expect(isSignedOut(new ForeignError("nope", 401))).toBe(true);
	});

	it("does not treat other statuses as signed out", () => {
		for (const status of [400, 403, 404, 409, 429, 500]) {
			expect(isSignedOut(new ApiError("nope", status))).toBe(false);
		}
	});

	it("is safe on values that are not errors at all", () => {
		for (const value of [null, undefined, "401", 401, {}, new Error("plain")]) {
			expect(isSignedOut(value)).toBe(false);
		}
	});
});

describe("retryUnlessSignedOut", () => {
	it("never retries a signed-out failure", () => {
		expect(retryUnlessSignedOut(0, new ApiError("nope", 401))).toBe(false);
	});

	it("retries a broken service, but only twice", () => {
		const error = new ApiError("boom", 500);
		expect(retryUnlessSignedOut(0, error)).toBe(true);
		expect(retryUnlessSignedOut(1, error)).toBe(true);
		expect(retryUnlessSignedOut(2, error)).toBe(false);
	});
});
