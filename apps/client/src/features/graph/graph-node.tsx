import { cn } from "@kc/ui/lib/utils";
import type { LabelStyle } from "./style";
import { fitCaption, nodeCaption, primaryLabel } from "./style";
import type { SimulationNode } from "./types";

const CAPTION_FONT_SIZE = 11;
const HALO_WIDTH = 9;
const BADGE_RADIUS = 9;

type GraphNodeProps = {
	node: SimulationNode;
	style: LabelStyle;
	selected: boolean;
	dimmed: boolean;
	dismissing: boolean;
	/** Neighbours not currently on the canvas, revealed by expanding. */
	hiddenNeighbourCount: number;
	/** Keyboard activation. Pointer selection happens in `onPointerDown`. */
	onSelect: (id: string) => void;
	onExpand: (id: string) => void;
	/** Selects the node and begins a drag. */
	onPointerDown: (id: string, event: React.PointerEvent<SVGGElement>) => void;
	onDismissTransitionEnd: (id: string) => void;
};

/**
 * Deliberately not memoised: the simulation mutates node positions in place, so
 * prop identity never changes between frames and memoisation would freeze the
 * shape at its first layout.
 */
export function GraphNodeShape({
	node,
	style,
	selected,
	dimmed,
	dismissing,
	hiddenNeighbourCount,
	onSelect,
	onExpand,
	onPointerDown,
	onDismissTransitionEnd,
}: GraphNodeProps) {
	const caption = fitCaption(nodeCaption(node), node.radius, CAPTION_FONT_SIZE);
	const label = primaryLabel(node);
	const pinned = node.fx !== null;

	return (
		// biome-ignore lint/a11y/useSemanticElements: a <button> cannot be an ancestor of SVG shapes, so the group carries the role.
		<g
			transform={`translate(${node.x} ${node.y})`}
			className={cn(
				"group cursor-grab outline-none",
				dismissing && "pointer-events-none",
			)}
			tabIndex={0}
			role="button"
			aria-label={`${label}: ${nodeCaption(node)}`}
			aria-pressed={selected}
			onPointerDown={(event) => onPointerDown(node.id, event)}
			onDoubleClick={() => onExpand(node.id)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect(node.id);
				}

				if (event.key === "e") {
					onExpand(node.id);
				}
			}}
		>
			<g
				className={cn(
					"origin-center transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] [transform-box:fill-box] motion-reduce:duration-100",
					dimmed ? "opacity-15" : "opacity-100",
					dismissing && "scale-[0.97] opacity-0 motion-reduce:scale-[0.99]",
				)}
				onTransitionEnd={(event) => {
					if (dismissing && event.propertyName === "opacity") {
						onDismissTransitionEnd(node.id);
					}
				}}
			>
				{/* Neo4j's selection halo: the node colour, ringed and translucent. */}
				{selected ? (
					<circle
						r={node.radius + HALO_WIDTH}
						fill={style.fill}
						fillOpacity={0.35}
					/>
				) : null}

				<circle
					r={node.radius}
					fill={style.fill}
					stroke={style.stroke}
					strokeWidth={2}
					className="group-focus-visible:stroke-ring"
				/>

				<text
					textAnchor="middle"
					dominantBaseline="central"
					fontSize={CAPTION_FONT_SIZE}
					fill={style.text}
					className="pointer-events-none select-none font-medium"
				>
					{caption}
				</text>

				{hiddenNeighbourCount > 0 ? (
					<g
						transform={`translate(${node.radius * 0.72} ${-node.radius * 0.72})`}
						className="pointer-events-none"
					>
						<circle
							r={BADGE_RADIUS}
							className="fill-foreground stroke-background"
							strokeWidth={2}
						/>
						<text
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={9}
							className="select-none fill-background font-semibold"
						>
							{hiddenNeighbourCount > 9 ? "9+" : hiddenNeighbourCount}
						</text>
					</g>
				) : null}

				{pinned ? (
					<circle
						r={3}
						cy={node.radius - 5}
						className="pointer-events-none fill-foreground/70"
					/>
				) : null}

				<title>{`${label}: ${nodeCaption(node)}`}</title>
			</g>
		</g>
	);
}
