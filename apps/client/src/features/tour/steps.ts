export interface TourStep {
	/** Matched against `data-tour` on the element to highlight. */
	target: string;
	title: string;
	body: string;
}

/**
 * The tour, in the order the product is actually used.
 *
 * Save first, then read: that is the order that makes the product make sense,
 * not the order the navigation happens to list. It also follows the hierarchy
 * everything else rests on — an account holds workspaces, a workspace holds
 * captures — because that is the part people get wrong when they arrive.
 *
 * The first two steps and the activity step now sit on different routes than
 * they used to: saving happens in the conversation, and what a save did shows
 * up beside the pages it changed.
 *
 * A step whose target is absent from the current page is skipped rather than
 * shown pointing at nothing, so this list can name things that only exist on
 * one route.
 */
export const TOUR_STEPS: TourStep[] = [
	{
		target: "workspace",
		title: "Workspaces hold everything",
		body: "One account can keep several. Each has its own captures, wiki, graph and conversations, and nothing crosses between them.",
	},
	{
		target: "nav-agent",
		title: "Saving and asking are the same place",
		body: "There is no separate capture form. Paste a link or an article into the conversation and it offers to keep it; ask a question and it answers from what you have kept.",
	},
	{
		target: "chat-input",
		title: "Three ways in",
		body: "Paste text, paste a link — fetched and extracted server-side — or attach a PDF with the paperclip. A long PDF is split, so nothing past the opening pages is quietly dropped.",
	},
	{
		target: "nav-notes",
		title: "The compiled wiki",
		body: "Pages write themselves from what you saved. Each claim keeps the sentence it came from, so you can check it.",
	},
	{
		target: "compile-feed",
		title: "Watch it land",
		body: "Every save produces a diff: which page it joined, which claims were added, what got disputed.",
	},
	{
		target: "nav-graph",
		title: "How topics connect",
		body: "Typed edges — extends, contradicts, prerequisite of — not an undifferentiated web of 'related'.",
	},
	{
		target: "nav-gaps",
		title: "What you haven't read",
		body: "Prerequisites your reading leans on but never covers, noticed while compiling.",
	},
	{
		target: "nav-ai-logs",
		title: "What it cost",
		body: "Every model call, the step that ran it, and the tokens it moved. Add your own rates and it prices them too.",
	},
	{
		target: "nav-settings",
		title: "Clip from the browser",
		body: "The extension saves the page you are already reading. Install it here, and paste its id so this account will accept its clips.",
	},
];
