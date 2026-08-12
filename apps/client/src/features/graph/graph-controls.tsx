import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { IconButton } from "./primitives";

type GraphControlsProps = {
	zoom: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFit: () => void;
	onRestart: () => void;
};

export function GraphControls({
	zoom,
	onZoomIn,
	onZoomOut,
	onFit,
	onRestart,
}: GraphControlsProps) {
	return (
		<div className="pointer-events-auto flex w-fit flex-col items-start gap-1.5">
			<span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums shadow-xs">
				{Math.round(zoom * 100)}%
			</span>

			<IconButton aria-label="Zoom in" title="Zoom in (+)" onClick={onZoomIn}>
				<Plus />
			</IconButton>

			<IconButton
				aria-label="Zoom out"
				title="Zoom out (-)"
				onClick={onZoomOut}
			>
				<Minus />
			</IconButton>

			<IconButton
				aria-label="Fit graph to view"
				title="Fit to view (0)"
				onClick={onFit}
			>
				<Maximize2 />
			</IconButton>

			<IconButton
				aria-label="Restart layout"
				title="Restart layout (R)"
				onClick={onRestart}
			>
				<RotateCcw />
			</IconButton>
		</div>
	);
}
