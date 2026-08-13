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
		target: "nav-capture",
		title: "Save what you read",
		body: "A passage, a link, a whole article, or a PDF. Saving is the only thing you have to do.",
	},
	{
		target: "capture-modes",
		title: "Four ways in",
		body: "Links are fetched and extracted server-side. PDFs are split when they are long, so nothing past the opening pages is quietly dropped. The extension clips the page you are already reading.",
	},
	{
		target: "compile-feed",
		title: "Watch it land",
		body: "Every save produces a diff: which page it joined, which claims were added, what got disputed.",
	},
	{
		target: "nav-notes",
		title: "The compiled wiki",
		body: "Pages write themselves from what you saved. Each claim keeps the sentence it came from, so you can check it.",
	},
	{
		target: "nav-agent",
		title: "Ask your own library",
		body: "Answers come only from pages this workspace compiled, and cite the claims they rest on. Conversations are saved.",
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
];
