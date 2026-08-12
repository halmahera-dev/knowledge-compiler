import { cn } from "@kc/ui/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraphControls } from "./graph-controls";
import { GraphInspector } from "./graph-inspector";
import { type GraphFocus, GraphLegend } from "./graph-legend";
import { GraphNodeShape } from "./graph-node";
import { GraphRelationshipShape } from "./graph-relationship";
import { useGraphSimulation } from "./hooks/use-graph-simulation";
import {
	useElementSize,
	useViewport,
	wheelZoomFactor,
	ZOOM_STEP,
} from "./hooks/use-viewport";
import { buildLabelStyles, labelStyleFor, primaryLabel } from "./style";
import type { GraphData, GraphSelection, SimulationNode } from "./types";

/** Pointer travel before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4;
const NODE_DISMISS_DURATION_MS = 160;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_EXIT = [0.7, 0, 0.84, 0] as const;

export type GraphViewerProps = {
	data: GraphData;
	/**
	 * Nodes on the canvas initially. Defaults to the whole graph; pass a small
	 * seed set to start narrow and let the user expand outward.
	 */
	initialVisibleNodeIds?: readonly string[];
	onSelectionChange?: (selection: GraphSelection) => void;
	className?: string;
};

type Adjacency = ReadonlyMap<string, ReadonlySet<string>>;

function buildAdjacency(data: GraphData): Adjacency {
	const adjacency = new Map<string, Set<string>>();

	const link = (from: string, to: string) => {
		const existing = adjacency.get(from);

		if (existing) {
			existing.add(to);
		} else {
			adjacency.set(from, new Set([to]));
		}
	};

	for (const relationship of data.relationships) {
		if (relationship.startNodeId === relationship.endNodeId) {
			continue;
		}

		link(relationship.startNodeId, relationship.endNodeId);
		link(relationship.endNodeId, relationship.startNodeId);
	}

	return adjacency;
}

function countBy<T>(items: readonly T[], key: (item: T) => string) {
	const counts = new Map<string, number>();

	for (const item of items) {
		const value = key(item);
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}

	return [...counts.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
}

/**
 * A Neo4j Browser style graph canvas: a force-directed layout of circular
 * nodes joined by curved, captioned relationship arcs, with pan, zoom, node
 * dragging, a legend, and a property inspector.
 */
export function GraphViewer({
	data,
	initialVisibleNodeIds,
	onSelectionChange,
	className,
}: GraphViewerProps) {
	const containerRef = useRef<HTMLElement | null>(null);
	const dismissTimersRef = useRef(
		new Map<string, ReturnType<typeof setTimeout>>(),
	);
	const size = useElementSize(containerRef);
	const shouldReduceMotion = useReducedMotion();

	const [visibleNodeIds, setVisibleNodeIds] = useState<ReadonlySet<string>>(
		() => new Set(initialVisibleNodeIds ?? data.nodes.map((node) => node.id)),
	);
	const [selection, setSelection] = useState<GraphSelection>(null);
	const [focus, setFocus] = useState<GraphFocus>(null);
	const [panning, setPanning] = useState(false);
	const [dismissingNodeIds, setDismissingNodeIds] = useState<
		ReadonlySet<string>
	>(() => new Set());

	const adjacency = useMemo(() => buildAdjacency(data), [data]);

	/**
	 * Colours come from the full graph, not the visible subset, so hiding a node
	 * never reshuffles the palette.
	 */
	const labelStyles = useMemo(() => buildLabelStyles(data.nodes), [data.nodes]);

	const visibleData = useMemo<GraphData>(() => {
		const nodes = data.nodes.filter((node) => visibleNodeIds.has(node.id));
		const present = new Set(nodes.map((node) => node.id));

		return {
			nodes,
			relationships: data.relationships.filter(
				(relationship) =>
					present.has(relationship.startNodeId) &&
					present.has(relationship.endNodeId),
			),
		};
	}, [data, visibleNodeIds]);

	const { simulation, frame, reheat } = useGraphSimulation(visibleData);
	const { viewport, setViewport, screenToGraph, panBy, zoomAt, fit } =
		useViewport();

	const hiddenNeighbourCounts = useMemo(() => {
		const counts = new Map<string, number>();

		for (const node of visibleData.nodes) {
			let hidden = 0;

			for (const neighbour of adjacency.get(node.id) ?? []) {
				if (!visibleNodeIds.has(neighbour)) {
					hidden += 1;
				}
			}

			counts.set(node.id, hidden);
		}

		return counts;
	}, [visibleData.nodes, adjacency, visibleNodeIds]);

	const legendLabels = useMemo(
		() =>
			countBy(visibleData.nodes, primaryLabel).map(([label, count]) => ({
				label,
				count,
				style: labelStyleFor(labelStyles, label),
			})),
		[visibleData.nodes, labelStyles],
	);

	const legendTypes = useMemo(
		() =>
			countBy(
				visibleData.relationships,
				(relationship) => relationship.type,
			).map(([type, count]) => ({ type, count })),
		[visibleData.relationships],
	);

	/** Nodes touched by the focused relationship type, kept bright while dimming. */
	const focusedTypeNodeIds = useMemo(() => {
		if (focus?.kind !== "type") {
			return null;
		}

		const ids = new Set<string>();

		for (const relationship of visibleData.relationships) {
			if (relationship.type === focus.value) {
				ids.add(relationship.startNodeId);
				ids.add(relationship.endNodeId);
			}
		}

		return ids;
	}, [focus, visibleData.relationships]);

	const select = useCallback(
		(next: GraphSelection) => {
			setSelection(next);
			onSelectionChange?.(next);
		},
		[onSelectionChange],
	);

	// --- Viewport bootstrapping -------------------------------------------

	const centred = useRef(false);
	const framed = useRef(false);

	// The layout is centred on the origin, so put the origin in the middle of
	// the canvas before the first frame or the graph unfolds from the corner.
	useEffect(() => {
		if (centred.current || size.width === 0 || size.height === 0) {
			return;
		}

		centred.current = true;
		setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
	}, [size, setViewport]);

	// Shape the layout to the canvas so a wide viewport spreads the graph out
	// instead of leaving the sides empty and squeezing it vertically.
	useEffect(() => {
		if (size.width === 0 || size.height === 0) {
			return;
		}

		simulation.setAspect(size.width / size.height);

		// Only nudge the opening layout. Rearranging a graph the user has already
		// been working with just because the window changed size would be rude.
		if (!framed.current) {
			reheat(0.5);
		}
	}, [size, simulation, reheat]);

	// Frame the graph once the opening layout stops moving.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `frame` is an intentional trigger, not a read value — it makes this re-check on every simulation tick.
	useEffect(() => {
		if (
			framed.current ||
			!simulation.isSettled ||
			simulation.nodes.length === 0 ||
			size.width === 0
		) {
			return;
		}

		framed.current = true;
		fit(simulation.nodes, size);
	}, [frame, simulation, size, fit]);

	// --- Pointer handling -------------------------------------------------

	const dragRef = useRef<{
		nodeId: string;
		startX: number;
		startY: number;
		moved: boolean;
	} | null>(null);
	const panRef = useRef<{
		lastX: number;
		lastY: number;
		moved: boolean;
	} | null>(null);

	const toGraphPoint = useCallback(
		(clientX: number, clientY: number) => {
			const bounds = containerRef.current?.getBoundingClientRect();

			if (!bounds) {
				return { x: 0, y: 0 };
			}

			return screenToGraph(clientX - bounds.left, clientY - bounds.top);
		},
		[screenToGraph],
	);

	/**
	 * Press selects and starts the drag in one gesture, the way Neo4j does.
	 * Selecting here rather than on click matters: the container takes pointer
	 * capture for the drag, which can retarget the synthesized click.
	 */
	const handleNodePointerDown = useCallback(
		(id: string, event: React.PointerEvent<SVGGElement>) => {
			event.stopPropagation();
			containerRef.current?.setPointerCapture(event.pointerId);

			dragRef.current = {
				nodeId: id,
				startX: event.clientX,
				startY: event.clientY,
				moved: false,
			};

			select({ kind: "node", id });

			const point = toGraphPoint(event.clientX, event.clientY);
			simulation.pin(id, point.x, point.y);
			reheat(0.3);
		},
		[simulation, reheat, toGraphPoint, select],
	);

	const handleSurfacePointerDown = useCallback(
		(event: React.PointerEvent<SVGRectElement>) => {
			containerRef.current?.setPointerCapture(event.pointerId);
			panRef.current = {
				lastX: event.clientX,
				lastY: event.clientY,
				moved: false,
			};
			setPanning(true);
		},
		[],
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			const drag = dragRef.current;

			if (drag) {
				if (
					Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >
					DRAG_THRESHOLD
				) {
					drag.moved = true;
				}

				const point = toGraphPoint(event.clientX, event.clientY);
				simulation.pin(drag.nodeId, point.x, point.y);
				reheat(0.3);

				return;
			}

			const pan = panRef.current;

			if (pan) {
				const dx = event.clientX - pan.lastX;
				const dy = event.clientY - pan.lastY;

				if (Math.hypot(dx, dy) > 0) {
					pan.moved = true;
				}

				pan.lastX = event.clientX;
				pan.lastY = event.clientY;
				panBy(dx, dy);
			}
		},
		[simulation, reheat, toGraphPoint, panBy],
	);

	const handlePointerUp = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			if (containerRef.current?.hasPointerCapture(event.pointerId)) {
				containerRef.current.releasePointerCapture(event.pointerId);
			}

			if (dragRef.current) {
				// Dropped nodes stay put, as they do in Neo4j Browser. "Restart
				// layout" releases every pin at once.
				dragRef.current = null;
				reheat(0.2);
			}

			const pan = panRef.current;

			if (pan) {
				// A press on empty canvas that did not turn into a pan is a click on
				// the background, which clears the selection.
				if (!pan.moved) {
					select(null);
				}

				panRef.current = null;
				setPanning(false);
			}
		},
		[reheat, select],
	);

	// --- Graph actions ----------------------------------------------------

	const expand = useCallback(
		(id: string) => {
			const neighbours = adjacency.get(id);

			if (!neighbours || neighbours.size === 0) {
				return;
			}

			setVisibleNodeIds((current) => {
				const next = new Set(current);

				for (const neighbour of neighbours) {
					next.add(neighbour);
				}

				return next.size === current.size ? current : next;
			});
		},
		[adjacency],
	);

	const finishDismiss = useCallback((id: string) => {
		const timer = dismissTimersRef.current.get(id);

		if (timer) {
			clearTimeout(timer);
			dismissTimersRef.current.delete(id);
		}

		setVisibleNodeIds((current) => {
			const next = new Set(current);
			next.delete(id);
			return next;
		});
		setDismissingNodeIds((current) => {
			const next = new Set(current);
			next.delete(id);
			return next;
		});
	}, []);

	const dismiss = useCallback(
		(id: string) => {
			if (dismissingNodeIds.has(id)) {
				return;
			}

			setDismissingNodeIds((current) => new Set(current).add(id));
			setSelection((current) =>
				current?.kind === "node" && current.id === id ? null : current,
			);

			dismissTimersRef.current.set(
				id,
				setTimeout(() => finishDismiss(id), NODE_DISMISS_DURATION_MS),
			);
		},
		[dismissingNodeIds, finishDismiss],
	);

	useEffect(
		() => () => {
			for (const timer of dismissTimersRef.current.values()) {
				clearTimeout(timer);
			}
		},
		[],
	);

	const togglePin = useCallback(
		(id: string) => {
			const node = simulation.node(id);

			if (!node) {
				return;
			}

			if (node.fx === null) {
				simulation.pin(id, node.x, node.y);
			} else {
				simulation.unpin(id);
			}

			reheat(0.2);
		},
		[simulation, reheat],
	);

	const restart = useCallback(() => {
		for (const node of simulation.nodes) {
			simulation.unpin(node.id);
		}

		reheat(1);
	}, [simulation, reheat]);

	const fitToView = useCallback(() => {
		fit(simulation.nodes, size);
	}, [fit, simulation, size]);

	// --- Wheel zoom -------------------------------------------------------

	// Registered natively: React's wheel listener is passive, so it cannot
	// preventDefault and the page would scroll while zooming.
	useEffect(() => {
		const element = containerRef.current;

		if (!element) {
			return;
		}

		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const bounds = element.getBoundingClientRect();

			zoomAt(
				wheelZoomFactor(event.deltaY),
				event.clientX - bounds.left,
				event.clientY - bounds.top,
			);
		};

		element.addEventListener("wheel", onWheel, { passive: false });

		return () => element.removeEventListener("wheel", onWheel);
	}, [zoomAt]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLElement>) => {
			if (event.key === "Escape") {
				select(null);
				setFocus(null);

				return;
			}

			if (event.key === "+" || event.key === "=") {
				zoomAt(ZOOM_STEP, size.width / 2, size.height / 2);
			} else if (event.key === "-") {
				zoomAt(1 / ZOOM_STEP, size.width / 2, size.height / 2);
			} else if (event.key === "0") {
				fitToView();
			} else if (event.key === "r" || event.key === "R") {
				restart();
			}
		},
		[select, zoomAt, size, fitToView, restart],
	);

	// --- Derived render state --------------------------------------------

	const selectedNodeId = selection?.kind === "node" ? selection.id : null;
	const selectedRelationshipId =
		selection?.kind === "relationship" ? selection.id : null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: `frame` is an intentional trigger, not a read value — it keeps the panel's pin state and positions current as the layout ticks.
	const inspectorTarget = useMemo(() => {
		if (!selection) {
			return null;
		}

		if (selection.kind === "node") {
			const node = simulation.node(selection.id);

			return node
				? ({
						kind: "node",
						node,
						hiddenNeighbourCount: hiddenNeighbourCounts.get(node.id) ?? 0,
					} as const)
				: null;
		}

		const relationship = simulation.relationships.find(
			(candidate) => candidate.id === selection.id,
		);

		return relationship
			? ({ kind: "relationship", relationship } as const)
			: null;
		// `frame` keeps pin state and positions in the panel current.
	}, [selection, simulation, hiddenNeighbourCounts, frame]);

	const isNodeDimmed = (node: SimulationNode) => {
		if (!focus) {
			return false;
		}

		if (focus.kind === "label") {
			return primaryLabel(node) !== focus.value;
		}

		return !focusedTypeNodeIds?.has(node.id);
	};

	return (
		<section
			ref={containerRef}
			aria-label="Graph viewer"
			// No tabIndex here: the container would become a non-interactive tab
			// stop. Shortcuts work off bubbled keydown instead, so they are live
			// whenever focus is on a node shape, a legend chip or a control.
			className={cn(
				"relative isolate size-full touch-none overflow-hidden bg-background outline-none",
				className,
			)}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onKeyDown={handleKeyDown}
		>
			{/* Presentational rather than aria-hidden: the node shapes inside are
          focusable buttons, and aria-hidden would strip them from the tree. */}
			<svg className="absolute inset-0 size-full" role="presentation">
				<rect
					width="100%"
					height="100%"
					fill="transparent"
					className={panning ? "cursor-grabbing" : "cursor-grab"}
					onPointerDown={handleSurfacePointerDown}
				/>

				<g
					transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}
				>
					<g>
						{simulation.relationships.map((relationship) => (
							<GraphRelationshipShape
								key={relationship.id}
								relationship={relationship}
								selected={relationship.id === selectedRelationshipId}
								adjacent={
									selectedNodeId !== null &&
									(relationship.source.id === selectedNodeId ||
										relationship.target.id === selectedNodeId)
								}
								dimmed={
									focus !== null &&
									(focus.kind === "type"
										? relationship.type !== focus.value
										: primaryLabel(relationship.source) !== focus.value &&
											primaryLabel(relationship.target) !== focus.value)
								}
								dismissing={
									dismissingNodeIds.has(relationship.source.id) ||
									dismissingNodeIds.has(relationship.target.id)
								}
								onSelect={(id) => select({ kind: "relationship", id })}
							/>
						))}
					</g>

					<g>
						{simulation.nodes.map((node) => (
							<GraphNodeShape
								key={node.id}
								node={node}
								style={labelStyleFor(labelStyles, primaryLabel(node))}
								selected={node.id === selectedNodeId}
								dimmed={isNodeDimmed(node)}
								dismissing={dismissingNodeIds.has(node.id)}
								hiddenNeighbourCount={hiddenNeighbourCounts.get(node.id) ?? 0}
								onSelect={(id) => select({ kind: "node", id })}
								onExpand={expand}
								onPointerDown={handleNodePointerDown}
								onDismissTransitionEnd={finishDismiss}
							/>
						))}
					</g>
				</g>
			</svg>

			{/* Legend top-left, controls bottom-left, inspector down the right edge
          so the three overlays never overlap. */}
			<div className="pointer-events-none absolute inset-x-3 top-[var(--graph-overlay-top,0.75rem)] bottom-3 flex flex-col justify-between gap-3">
				<div className={cn("min-w-0", inspectorTarget && "pr-[19rem]")}>
					<GraphLegend
						labels={legendLabels}
						types={legendTypes}
						focus={focus}
						onFocusChange={setFocus}
					/>
				</div>

				<GraphControls
					zoom={viewport.k}
					onZoomIn={() => zoomAt(ZOOM_STEP, size.width / 2, size.height / 2)}
					onZoomOut={() =>
						zoomAt(1 / ZOOM_STEP, size.width / 2, size.height / 2)
					}
					onFit={fitToView}
					onRestart={restart}
				/>
			</div>

			<AnimatePresence>
				{inspectorTarget ? (
					<motion.div
						key="graph-inspector"
						initial={{
							opacity: 0,
							transform: `translateX(${shouldReduceMotion ? 2 : 6}px)`,
						}}
						animate={{ opacity: 1, transform: "translateX(0px)" }}
						exit={{
							opacity: 0,
							transform: `translateX(${shouldReduceMotion ? 2 : 6}px)`,
							transition: {
								duration: shouldReduceMotion ? 0.1 : 0.12,
								ease: EASE_EXIT,
							},
						}}
						transition={{
							duration: shouldReduceMotion ? 0.1 : 0.15,
							ease: EASE_OUT,
						}}
						className="pointer-events-none absolute top-[var(--graph-overlay-top,0.75rem)] right-3 bottom-3 flex items-start justify-end"
					>
						<GraphInspector
							target={inspectorTarget}
							labelStyles={labelStyles}
							onClose={() => select(null)}
							onExpand={expand}
							onDismiss={dismiss}
							onTogglePin={togglePin}
						/>
					</motion.div>
				) : null}
			</AnimatePresence>

			<AnimatePresence>
				{visibleData.nodes.length === 0 ? (
					<motion.div
						key="graph-empty-state"
						initial={{
							opacity: 0,
							transform: `scale(${shouldReduceMotion ? 0.99 : 0.97})`,
						}}
						animate={{ opacity: 1, transform: "scale(1)" }}
						exit={{
							opacity: 0,
							transform: `scale(${shouldReduceMotion ? 0.99 : 0.97})`,
							transition: {
								duration: shouldReduceMotion ? 0.12 : 0.14,
								ease: EASE_EXIT,
							},
						}}
						transition={{
							duration: shouldReduceMotion ? 0.12 : 0.2,
							ease: EASE_OUT,
						}}
						className="pointer-events-none absolute inset-0 flex items-center justify-center"
					>
						<p className="text-muted-foreground text-sm">
							No nodes to display.
						</p>
					</motion.div>
				) : null}
			</AnimatePresence>
		</section>
	);
}
