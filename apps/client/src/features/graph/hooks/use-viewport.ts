import { useCallback, useEffect, useState } from "react";
import type { SimulationNode, Size, Viewport } from "../types";

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
/** Never zoom past 1:1 when framing a graph, or small graphs look magnified. */
const MAX_FIT_ZOOM = 1;
const FIT_PADDING = 64;
/** Zoom multiplier for the buttons and keyboard shortcuts. */
export const ZOOM_STEP = 1.35;
/** Trackpad wheel deltas are small; this maps them to a comfortable rate. */
const WHEEL_SENSITIVITY = 0.0016;

export const IDENTITY_VIEWPORT: Viewport = { x: 0, y: 0, k: 1 };

function clampZoom(k: number): number {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

/**
 * Wheel and trackpad deltas mapped to a zoom factor. Exponential so that
 * zooming in then out by the same amount returns to the same scale.
 */
export function wheelZoomFactor(deltaY: number): number {
	return Math.exp(-deltaY * WHEEL_SENSITIVITY);
}

/**
 * Measures an element without touching `window` during render, so the tree
 * still renders on the server. Starts at zero, which callers treat as
 * "not measured yet".
 */
export function useElementSize(ref: React.RefObject<HTMLElement | null>): Size {
	const [size, setSize] = useState<Size>({ width: 0, height: 0 });

	useEffect(() => {
		const element = ref.current;

		if (!element) {
			return;
		}

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];

			if (entry) {
				setSize({
					width: entry.contentRect.width,
					height: entry.contentRect.height,
				});
			}
		});

		observer.observe(element);

		return () => observer.disconnect();
	}, [ref]);

	return size;
}

/**
 * Pan and zoom state for the graph surface.
 *
 * Screen position is `graph * k + offset`, which keeps the inverse mapping
 * cheap enough to run on every pointer move during a node drag.
 */
export function useViewport() {
	const [viewport, setViewport] = useState<Viewport>(IDENTITY_VIEWPORT);

	const screenToGraph = useCallback(
		(screenX: number, screenY: number, current: Viewport = viewport) => ({
			x: (screenX - current.x) / current.k,
			y: (screenY - current.y) / current.k,
		}),
		[viewport],
	);

	const panBy = useCallback((dx: number, dy: number) => {
		setViewport((current) => ({
			...current,
			x: current.x + dx,
			y: current.y + dy,
		}));
	}, []);

	/** Zoom keeping the graph point under (`originX`, `originY`) fixed. */
	const zoomAt = useCallback(
		(factor: number, originX: number, originY: number) => {
			setViewport((current) => {
				const k = clampZoom(current.k * factor);
				const ratio = k / current.k;

				return {
					k,
					x: originX - (originX - current.x) * ratio,
					y: originY - (originY - current.y) * ratio,
				};
			});
		},
		[],
	);

	/** Frame every node with padding, centred in the given size. */
	const fit = useCallback((nodes: readonly SimulationNode[], size: Size) => {
		if (nodes.length === 0 || size.width === 0 || size.height === 0) {
			return;
		}

		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		for (const node of nodes) {
			minX = Math.min(minX, node.x - node.radius);
			minY = Math.min(minY, node.y - node.radius);
			maxX = Math.max(maxX, node.x + node.radius);
			maxY = Math.max(maxY, node.y + node.radius);
		}

		const graphWidth = Math.max(1, maxX - minX);
		const graphHeight = Math.max(1, maxY - minY);
		const k = clampZoom(
			Math.min(
				MAX_FIT_ZOOM,
				(size.width - FIT_PADDING * 2) / graphWidth,
				(size.height - FIT_PADDING * 2) / graphHeight,
			),
		);

		setViewport({
			k,
			x: size.width / 2 - ((minX + maxX) / 2) * k,
			y: size.height / 2 - ((minY + maxY) / 2) * k,
		});
	}, []);

	return {
		viewport,
		setViewport,
		screenToGraph,
		panBy,
		zoomAt,
		fit,
	};
}
