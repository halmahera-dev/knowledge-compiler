/**
 * The ledger hands the copilot a question, not a command.
 *
 * It has to name the disagreement precisely enough that the answer is about
 * these two sources rather than about the subject in general — the copilot
 * answers only from compiled claims, and a vague question earns a vague refusal.
 */
import { describe, expect, test } from "vitest";
import { questionFor } from "./dispute-question";

describe("questionFor", () => {
	test("names the claim and the page it sits on", () => {
		const question = questionFor({
			text: "4-bit quantisation is near-lossless above 7B parameters.",
			pageTitle: "Post-training quantisation",
		});

		expect(question).toContain(
			"4-bit quantisation is near-lossless above 7B parameters.",
		);
		expect(question).toContain("Post-training quantisation");
	});

	test("asks for both sides rather than for a verdict", () => {
		// A question asking which source is right invites the copilot to do the
		// one thing this product refuses to do on the reader's behalf.
		const question = questionFor({ text: "X", pageTitle: "Y" }).toLowerCase();

		expect(question).toContain("both");
		expect(question).not.toContain("which is right");
		expect(question).not.toContain("which one is correct");
	});
});
