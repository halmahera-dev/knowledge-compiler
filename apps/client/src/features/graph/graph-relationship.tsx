import { cn } from "@kc/ui/lib/utils";
import { relationshipGeometry } from "./geometry";
import { estimateTextWidth } from "./style";
import type { SimulationRelationship } from "./types";

const CAPTION_FONT_SIZE = 10;
/** Below this the line is too short to break for a caption. */
const CAPTION_MIN_LENGTH = 42;
/** Invisible wide stroke so thin arcs are still clickable. */
const HIT_STROKE_WIDTH = 16;

type GraphRelationshipProps = {
	relationship: SimulationRelationship;
	selected: boolean;
	/** Attached to the selected node, so it reads as part of that selection. */
	adjacent: boolean;
	dimmed: boolean;
	dismissing: boolean;
	onSelect: (id: string) => void;
};

/**
 * Deliberately not memoised: the simulation mutates node positions in place, so
 * prop identity never changes between frames and memoisation would freeze the
 * shape at its first layout.
 */
export function GraphRelationshipShape({
	relationship,
	selected,
	adjacent,
	dimmed,
	dismissing,
	onSelect,
}: GraphRelationshipProps) {
	const geometry = relationshipGeometry(relationship);

	if (geometry.path === "") {
		return null;
	}

	const emphasised = selected || adjacent;
	const showCaption = geometry.length >= CAPTION_MIN_LENGTH;
	const captionWidth = estimateTextWidth(relationship.type, CAPTION_FONT_SIZE);

	return (
		<g
			className={cn(
				"transition-opacity duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:duration-100",
				dimmed ? "opacity-15" : "opacity-100",
				dismissing && "pointer-events-none opacity-0",
			)}
			data-selected={selected || undefined}
		>
			<path
				d={geometry.path}
				fill="none"
				className={cn(
					"transition-[stroke]",
					selected
						? "stroke-foreground"
						: adjacent
							? "stroke-muted-foreground"
							: "stroke-muted-foreground/45",
				)}
				strokeWidth={emphasised ? 2.25 : 1.5}
			/>

			<path
				d={geometry.arrow}
				className={cn(
					"transition-[fill]",
					selected
						? "fill-foreground"
						: adjacent
							? "fill-muted-foreground"
							: "fill-muted-foreground/45",
				)}
			/>

			{showCaption ? (
				<g
					transform={`translate(${geometry.caption.x} ${geometry.caption.y}) rotate(${geometry.caption.angle})`}
				>
					{/* Sits in a gap in the line, the way Neo4j breaks the arc for text. */}
					<rect
						x={-captionWidth / 2 - 4}
						y={-CAPTION_FONT_SIZE / 2 - 2}
						width={captionWidth + 8}
						height={CAPTION_FONT_SIZE + 4}
						className="fill-background"
					/>
					<text
						textAnchor="middle"
						dominantBaseline="central"
						fontSize={CAPTION_FONT_SIZE}
						className={cn(
							"select-none font-medium",
							emphasised ? "fill-foreground" : "fill-muted-foreground",
						)}
					>
						{relationship.type}
					</text>
				</g>
			) : null}

			<path
				d={geometry.path}
				fill="none"
				stroke="transparent"
				strokeWidth={HIT_STROKE_WIDTH}
				className="cursor-pointer"
				onPointerDown={(event) => {
					// Selecting on press rather than click: pointer capture during a
					// drag can retarget the synthesized click away from this element.
					event.stopPropagation();
					onSelect(relationship.id);
				}}
			>
				<title>{`${relationship.source.id} ${relationship.type} ${relationship.target.id}`}</title>
			</path>
		</g>
	);
}
