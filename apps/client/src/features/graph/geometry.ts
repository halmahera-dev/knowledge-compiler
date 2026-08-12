import type { SimulationRelationship } from "./types";

export type Point = { x: number; y: number };

/** How far apart bundled relationships between the same pair of nodes bow. */
const PARALLEL_SPACING = 24;
const ARROW_LENGTH = 11;
const ARROW_HALF_WIDTH = 4.5;
/** Breathing room between a node's circle and the line touching it. */
const NODE_GAP = 2;
const SELF_LOOP_BASE = 42;
const SELF_LOOP_STEP = 22;

export type RelationshipGeometry = {
	/** Path from the source boundary to the base of the arrowhead. */
	path: string;
	/** Filled triangle sitting on the target boundary. */
	arrow: string;
	/** Where the type name goes, already rotated to stay upright. */
	caption: { x: number; y: number; angle: number };
	/** Length of the drawn line; used to hide captions that cannot fit. */
	length: number;
};

function lerp(a: Point, b: Point, t: number): Point {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function quadPoint(p0: Point, c: Point, p1: Point, t: number): Point {
	const u = 1 - t;

	return {
		x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
		y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
	};
}

function quadTangent(p0: Point, c: Point, p1: Point, t: number): Point {
	const u = 1 - t;

	return {
		x: 2 * (u * (c.x - p0.x) + t * (p1.x - c.x)),
		y: 2 * (u * (c.y - p0.y) + t * (p1.y - c.y)),
	};
}

/**
 * The sub-curve of a quadratic bezier over `[t0, t1]`, which is itself a
 * quadratic bezier (de Casteljau).
 */
function splitQuad(
	p0: Point,
	c: Point,
	p1: Point,
	t0: number,
	t1: number,
): { start: Point; control: Point; end: Point } {
	const a = lerp(p0, c, t0);
	const b = lerp(c, p1, t0);

	return {
		start: quadPoint(p0, c, p1, t0),
		control: lerp(a, b, t1),
		end: quadPoint(p0, c, p1, t1),
	};
}

/**
 * Bisect `f` over `[lo, hi]`, assuming it changes sign exactly once. Used to
 * find where a curve crosses a node's circle instead of approximating with a
 * straight line, which visibly misplaces arrowheads on strongly bowed arcs.
 */
function bisect(f: (t: number) => number, lo: number, hi: number): number {
	let a = lo;
	let b = hi;
	const signAtA = Math.sign(f(a));

	for (let i = 0; i < 24; i += 1) {
		const mid = (a + b) / 2;

		if (Math.sign(f(mid)) === signAtA) {
			a = mid;
		} else {
			b = mid;
		}
	}

	return (a + b) / 2;
}

function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Sampled arc length. Bowed arcs are meaningfully longer than their chord. */
function quadLength(p0: Point, c: Point, p1: Point): number {
	const samples = 8;
	let total = 0;
	let previous = p0;

	for (let i = 1; i <= samples; i += 1) {
		const current = quadPoint(p0, c, p1, i / samples);
		total += distance(previous, current);
		previous = current;
	}

	return total;
}

function normalize(v: Point): Point {
	const length = Math.hypot(v.x, v.y);

	if (length === 0) {
		return { x: 1, y: 0 };
	}

	return { x: v.x / length, y: v.y / length };
}

/** Keeps text from rendering upside down on arcs running right-to-left. */
function uprightAngle(dx: number, dy: number): number {
	const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

	if (angle > 90) {
		return angle - 180;
	}

	if (angle < -90) {
		return angle + 180;
	}

	return angle;
}

function arrowPath(base: Point, direction: Point): string {
	const tip = {
		x: base.x + direction.x * ARROW_LENGTH,
		y: base.y + direction.y * ARROW_LENGTH,
	};
	const normal = { x: -direction.y, y: direction.x };
	const left = {
		x: base.x + normal.x * ARROW_HALF_WIDTH,
		y: base.y + normal.y * ARROW_HALF_WIDTH,
	};
	const right = {
		x: base.x - normal.x * ARROW_HALF_WIDTH,
		y: base.y - normal.y * ARROW_HALF_WIDTH,
	};

	return `M${left.x} ${left.y}L${tip.x} ${tip.y}L${right.x} ${right.y}Z`;
}

/**
 * A relationship from a node to itself, drawn as a loop leaving and re-entering
 * the top of the circle. Successive loops on the same node grow outward.
 */
function selfLoopGeometry(
	relationship: SimulationRelationship,
): RelationshipGeometry {
	const node = relationship.source;
	const reach = SELF_LOOP_BASE + relationship.parallelIndex * SELF_LOOP_STEP;
	const spread = 0.75;
	const exitAngle = -Math.PI / 2 - spread;
	const entryAngle = -Math.PI / 2 + spread;
	const boundary = node.radius + NODE_GAP;

	const start = {
		x: node.x + Math.cos(exitAngle) * boundary,
		y: node.y + Math.sin(exitAngle) * boundary,
	};
	const entry = {
		x: node.x + Math.cos(entryAngle) * boundary,
		y: node.y + Math.sin(entryAngle) * boundary,
	};
	const control1 = {
		x: node.x + Math.cos(exitAngle) * (boundary + reach),
		y: node.y + Math.sin(exitAngle) * (boundary + reach),
	};
	const control2 = {
		x: node.x + Math.cos(entryAngle) * (boundary + reach),
		y: node.y + Math.sin(entryAngle) * (boundary + reach),
	};

	// Stop the curve short of the circle so the arrowhead lands on the boundary.
	const direction = normalize({
		x: entry.x - control2.x,
		y: entry.y - control2.y,
	});
	const base = {
		x: entry.x - direction.x * ARROW_LENGTH,
		y: entry.y - direction.y * ARROW_LENGTH,
	};

	return {
		path:
			`M${start.x} ${start.y}` +
			`C${control1.x} ${control1.y} ${control2.x} ${control2.y} ${base.x} ${base.y}`,
		arrow: arrowPath(base, direction),
		caption: {
			x: node.x,
			// A cubic reaches about three quarters of the way to its control points.
			y: node.y - (boundary + reach) * 0.78,
			angle: 0,
		},
		length: reach * 2,
	};
}

/**
 * Where a relationship should be drawn given the current node positions.
 *
 * Bundled relationships bow away from the straight line by a fixed spacing,
 * mirrored around the chord. The bow is measured in the pair's canonical id
 * order so that `A->B` and `B->A` land on opposite sides instead of on top of
 * each other.
 */
export function relationshipGeometry(
	relationship: SimulationRelationship,
): RelationshipGeometry {
	const { source, target, parallelIndex, parallelCount, reversed } =
		relationship;

	if (source.id === target.id) {
		return selfLoopGeometry(relationship);
	}

	const from = { x: source.x, y: source.y };
	const to = { x: target.x, y: target.y };

	const centred = parallelIndex - (parallelCount - 1) / 2;
	const bow = centred * PARALLEL_SPACING * (reversed ? -1 : 1);

	const direction = normalize({ x: to.x - from.x, y: to.y - from.y });
	const normal = { x: -direction.y, y: direction.x };
	const midpoint = lerp(from, to, 0.5);
	// A quadratic deviates from its chord by half the control offset, so double
	// the offset to make the visible bow match `bow`.
	const control = {
		x: midpoint.x + normal.x * bow * 2,
		y: midpoint.y + normal.y * bow * 2,
	};

	const sourceBoundary = source.radius + NODE_GAP;
	const targetBoundary = target.radius + NODE_GAP + ARROW_LENGTH;
	const empty: RelationshipGeometry = {
		path: "",
		arrow: "",
		caption: { x: midpoint.x, y: midpoint.y, angle: 0 },
		length: 0,
	};

	// Nodes can overlap while the layout settles; there is no line to draw then.
	if (quadLength(from, control, to) <= sourceBoundary + targetBoundary) {
		return empty;
	}

	const tStart = bisect(
		(t) => distance(quadPoint(from, control, to, t), from) - sourceBoundary,
		0,
		1,
	);
	const tEnd = bisect(
		(t) => distance(quadPoint(from, control, to, t), to) - targetBoundary,
		1,
		0,
	);

	if (tStart >= tEnd) {
		return empty;
	}

	const segment = splitQuad(from, control, to, tStart, tEnd);
	const endDirection = normalize(quadTangent(from, control, to, tEnd));
	const captionPoint = quadPoint(from, control, to, (tStart + tEnd) / 2);

	return {
		path:
			`M${segment.start.x} ${segment.start.y}` +
			`Q${segment.control.x} ${segment.control.y} ${segment.end.x} ${segment.end.y}`,
		arrow: arrowPath(segment.end, endDirection),
		caption: {
			x: captionPoint.x,
			y: captionPoint.y,
			// The tangent of a quadratic at its midpoint is parallel to its chord.
			angle: uprightAngle(to.x - from.x, to.y - from.y),
		},
		length: distance(segment.start, segment.end),
	};
}
