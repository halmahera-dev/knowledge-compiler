import type { GraphNode, PropertyValue } from "./types";

export type LabelStyle = {
	fill: string;
	stroke: string;
	text: string;
};

/**
 * Node palette drawn from the Tailwind colour scale: `400` fills, `600`
 * borders, `950` captions, which keeps text contrast comfortable on every hue.
 * Hues are ordered to separate neighbours, so a graph with a handful of labels
 * gets visibly different colours rather than adjacent ones.
 *
 * Values are inlined rather than read as `var(--color-*)` because Tailwind
 * tree-shakes theme variables that no utility class references, and these are
 * applied as SVG paint attributes rather than classes.
 */
const LABEL_PALETTE: readonly LabelStyle[] = [
	// sky
	{
		fill: "oklch(74.6% 0.16 232.661)",
		stroke: "oklch(58.8% 0.158 241.966)",
		text: "oklch(29.3% 0.066 243.157)",
	},
	// amber
	{
		fill: "oklch(82.8% 0.189 84.429)",
		stroke: "oklch(66.6% 0.179 58.318)",
		text: "oklch(27.9% 0.077 45.635)",
	},
	// emerald
	{
		fill: "oklch(76.5% 0.177 163.223)",
		stroke: "oklch(59.6% 0.145 163.225)",
		text: "oklch(26.2% 0.051 172.552)",
	},
	// rose
	{
		fill: "oklch(71.2% 0.194 13.428)",
		stroke: "oklch(58.6% 0.253 17.585)",
		text: "oklch(27.1% 0.105 12.094)",
	},
	// violet
	{
		fill: "oklch(70.2% 0.183 293.541)",
		stroke: "oklch(54.1% 0.281 293.009)",
		text: "oklch(28.3% 0.141 291.089)",
	},
	// lime
	{
		fill: "oklch(84.1% 0.238 128.85)",
		stroke: "oklch(64.8% 0.2 131.684)",
		text: "oklch(27.4% 0.072 132.109)",
	},
	// orange
	{
		fill: "oklch(75% 0.183 55.934)",
		stroke: "oklch(64.6% 0.222 41.116)",
		text: "oklch(26.6% 0.079 36.259)",
	},
	// cyan
	{
		fill: "oklch(78.9% 0.154 211.53)",
		stroke: "oklch(60.9% 0.126 221.723)",
		text: "oklch(30.2% 0.056 229.695)",
	},
	// fuchsia
	{
		fill: "oklch(74% 0.238 322.16)",
		stroke: "oklch(59.1% 0.293 322.896)",
		text: "oklch(29.3% 0.136 325.661)",
	},
	// teal
	{
		fill: "oklch(77.7% 0.152 181.912)",
		stroke: "oklch(60% 0.118 184.704)",
		text: "oklch(27.7% 0.046 192.524)",
	},
	// indigo
	{
		fill: "oklch(67.3% 0.182 276.935)",
		stroke: "oklch(51.1% 0.262 276.966)",
		text: "oklch(25.7% 0.09 281.288)",
	},
	// pink
	{
		fill: "oklch(71.8% 0.202 349.761)",
		stroke: "oklch(59.2% 0.249 0.584)",
		text: "oklch(28.4% 0.109 3.907)",
	},
];

/** slate, for anything past the end of the palette. */
const FALLBACK_STYLE: LabelStyle = {
	fill: "oklch(70.4% 0.04 256.788)",
	stroke: "oklch(44.6% 0.043 257.281)",
	text: "oklch(12.9% 0.042 264.695)",
};

/**
 * Nodes the detection run has not put in a cluster yet. Slate, so an
 * unclustered node reads as "no answer" rather than as a cluster of its own.
 */
const UNCLUSTERED_STYLE = FALLBACK_STYLE;

/** The cluster number a node carries, or null before the first detection run. */
export function communityOf(node: GraphNode): number | null {
	const value = node.properties.community;
	return typeof value === "number" ? value : null;
}

/**
 * A cluster's colour.
 *
 * Nodes used to be painted by label, and there are exactly two labels in this
 * product — Topic and Concept — so the whole canvas came out in two colours and
 * the clustering the compiler works out was invisible. The same palette now
 * indexes by cluster instead, which is the thing worth seeing.
 *
 * `community` is a colour index, not an identity: detection renumbers on every
 * save. Fine for paint, which is why nothing is stored against it.
 */
export function communityStyleFor(community: number | null): LabelStyle {
	if (community === null) {
		return UNCLUSTERED_STYLE;
	}

	return LABEL_PALETTE[community % LABEL_PALETTE.length] ?? UNCLUSTERED_STYLE;
}

/**
 * A, B, … Z, AA — a name a reader can say out loud and point at.
 *
 * The cluster number is an implementation detail that changes every save;
 * "cluster 7" invites the reader to remember something that will not be true
 * tomorrow. A letter reads as a position in a list, which is all it is.
 */
export function communityName(community: number | null): string {
	if (community === null) {
		return "Unclustered";
	}

	let name = "";
	let remaining = community;

	while (true) {
		name = String.fromCharCode(65 + (remaining % 26)) + name;
		remaining = Math.floor(remaining / 26) - 1;

		if (remaining < 0) {
			return name;
		}
	}
}

/**
 * Neo4j renders one label per node and uses the last one, which by convention
 * is the most specific.
 */
export function primaryLabel(node: GraphNode): string {
	return node.labels.at(-1) ?? "Node";
}

/**
 * Property names worth printing inside a node, checked in order before
 * falling back to any string property.
 */
const CAPTION_KEYS = ["name", "title", "label", "caption", "id"];

export function nodeCaption(node: GraphNode): string {
	for (const key of CAPTION_KEYS) {
		const value = node.properties[key];

		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}

	for (const value of Object.values(node.properties)) {
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}

	return primaryLabel(node);
}

export function formatPropertyValue(value: PropertyValue): string {
	if (value === null) {
		return "null";
	}

	if (Array.isArray(value)) {
		return value.join(", ");
	}

	return String(value);
}

const NODE_BASE_RADIUS = 21;
const NODE_MAX_RADIUS = 44;

/** Nodes grow with their degree, the way Neo4j emphasises hubs. */
export function radiusForDegree(degree: number): number {
	return Math.min(NODE_MAX_RADIUS, NODE_BASE_RADIUS + Math.sqrt(degree) * 4.5);
}

/**
 * Average glyph width as a fraction of font size for Geist. Close enough to
 * lay out captions without measuring text on every frame.
 */
const GLYPH_RATIO = 0.55;

export function estimateTextWidth(text: string, fontSize: number): number {
	return text.length * fontSize * GLYPH_RATIO;
}

/** Trim a caption to what fits inside a circle of `radius`. */
export function fitCaption(
	caption: string,
	radius: number,
	fontSize: number,
): string {
	const maxChars = Math.floor((radius * 2 - 10) / (fontSize * GLYPH_RATIO));

	if (maxChars <= 1) {
		return "";
	}

	if (caption.length <= maxChars) {
		return caption;
	}

	return `${caption.slice(0, Math.max(1, maxChars - 1))}…`;
}
