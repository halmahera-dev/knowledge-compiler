import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { ForceSimulation } from "../simulation";
import type { GraphData } from "../types";

/**
 * Owns a force simulation and re-renders while it is running.
 *
 * The simulation mutates its node objects in place, so a frame counter is
 * enough to drive React; nothing is copied per tick. The loop stops as soon as
 * the layout settles, so a static graph costs nothing.
 */
export function useGraphSimulation(data: GraphData) {
	const simulation = useMemo(() => new ForceSimulation(), []);
	const [frame, nextFrame] = useReducer((count: number) => count + 1, 0);
	const running = useRef(false);
	const rafRef = useRef<number | null>(null);

	// `nextFrame` is stable, and the loop reads live simulation state each frame.
	const run = useRef(() => {
		if (running.current) {
			return;
		}

		running.current = true;

		const step = () => {
			const advanced = simulation.tick();
			nextFrame();

			if (advanced) {
				rafRef.current = requestAnimationFrame(step);
			} else {
				running.current = false;
				rafRef.current = null;
			}
		};

		rafRef.current = requestAnimationFrame(step);
	});

	useEffect(() => {
		simulation.setGraph(data);
		simulation.reheat(1);
		run.current();
	}, [data, simulation]);

	useEffect(
		() => () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
			}

			running.current = false;
		},
		[],
	);

	/**
	 * Restart the layout and the animation loop.
	 *
	 * Stable across renders, and that is load-bearing rather than tidiness. This
	 * component re-renders on every tick, so a fresh closure here re-ran every
	 * effect that depends on it — including the one that reheats to 0.5 while the
	 * graph is unframed. That pinned alpha above the settling threshold forever:
	 * the layout never settled, the rAF loop never idled, and the viewer burned a
	 * frame's work sixty times a second on a graph that had stopped moving.
	 */
	const reheat = useCallback(
		(alpha?: number) => {
			simulation.reheat(alpha);
			run.current();
		},
		[simulation],
	);

	return {
		simulation,
		/** Increments every tick; read it to make a render depend on positions. */
		frame,
		reheat,
	};
}
