"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { ProductTour } from "@/features/tour/product-tour";

interface TourControls {
	start: () => void;
	stop: () => void;
	isOpen: boolean;
}

const TourContext = createContext<TourControls | null>(null);

export function useTour(): TourControls {
	const controls = useContext(TourContext);
	if (!controls) {
		throw new Error("useTour must be used inside <TourProvider>");
	}
	return controls;
}

/** Whether the keystroke landed somewhere the reader is writing. */
function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable ||
		["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
	);
}

/**
 * Owns whether the tour is showing, so anything in the shell can start it.
 *
 * The tour is mounted only while open: it measures the page on mount, and a
 * component that has been sitting in the tree since the last navigation would
 * be measuring a page that has since changed.
 *
 * `?` starts it — the conventional help key, and the one people try. It is
 * ignored while typing, because a question mark is also a character.
 */
export function TourProvider({ children }: { children: ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);

	const start = useCallback(() => setIsOpen(true), []);
	const stop = useCallback(() => setIsOpen(false), []);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "?" || event.metaKey || event.ctrlKey) return;
			if (isTyping(event.target)) return;
			event.preventDefault();
			setIsOpen((open) => !open);
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const controls = useMemo(
		() => ({ start, stop, isOpen }),
		[start, stop, isOpen],
	);

	return (
		<TourContext.Provider value={controls}>
			{children}
			{isOpen ? <ProductTour onClose={stop} /> : null}
		</TourContext.Provider>
	);
}
