/**
 * What a screen reader hears when the feed changes.
 *
 * The whole point of the feed is watching something land, and that was purely
 * visual: cards appeared and changed with nothing announced. Reading a card
 * aloud would be unusable — a diff carries a page title, an action, and counts
 * of claims, sections, nodes and edges — so this is one sentence per event, and
 * only for the transitions that mean something.
 *
 * Pure, and therefore testable, which is why it does not live inside the view.
 */
import type { CompileDiff } from "./run-api";

/**
 * Ends a spoken clause with exactly one terminator.
 *
 * A truncated title already ends in an ellipsis, so appending a full stop gave
 * "…." — which a screen reader renders as a stumble rather than a pause.
 */
export function sentence(text: string): string {
	return /[.…!?]$/.test(text) ? text : `${text}.`;
}

/**
 * Shortens a title for speech.
 *
 * A pasted excerpt has no real title yet, so the server derives one from the
 * opening words — fine to glance at on a card, but a screen reader announces
 * the whole thing, and eighty characters of prose read aloud is not an
 * announcement. Cut on a word boundary; a mid-word cut is worse heard than seen.
 */
export function spokenTitle(title: string | null, limit = 48): string {
	const clean = (title ?? "").replace(/…$/, "").trim();
	if (!clean) return "a saved item";
	if (clean.length <= limit) return clean;

	const cut = clean.slice(0, limit);
	const lastSpace = cut.lastIndexOf(" ");
	return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** One sentence describing what a finished compile did. */
export function announce(diff: CompileDiff): string {
	const verb =
		diff.action === "create"
			? "Created"
			: diff.action === "merge"
				? "Merged into"
				: "Added to";
	const disputed =
		diff.claimsDisputed > 0 ? `, ${diff.claimsDisputed} disputed` : "";

	return `${sentence(`${verb} ${spokenTitle(diff.page.title)}`)} ${diff.claimsAdded} claims added${disputed}.`;
}
