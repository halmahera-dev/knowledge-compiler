/**
 * What the ledger asks the copilot on the reader's behalf.
 *
 * Phrased to ask for both sides and what separates them, never for a verdict.
 * The product's whole position is that deciding between two sources belongs to
 * the reader; a button that asked the model to settle it would undo that in one
 * click, and would do it in the product's own voice.
 */
export function questionFor(dispute: {
	text: string;
	pageTitle: string;
}): string {
	return `My sources disagree about this claim on ${dispute.pageTitle}: "${dispute.text}" — set out both sides and what separates them.`;
}
