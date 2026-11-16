"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { useStore } from "@xyflow/react";

/** How far a page has scrolled a map that it sizes and scrolls itself (the course page's pane), told as it scrolls. */
export interface MapScroll {
	left: () => number;
	subscribe: (onChange: () => void) => () => void;
	set: (left: number) => void;
}

/** A scroll position a page keeps for the map it scrolls. */
export function mapScroll(): MapScroll {
	let left = 0;
	const listeners = new Set<() => void>();
	return {
		left: () => left,
		subscribe: (onChange) => {
			listeners.add(onChange);
			return () => listeners.delete(onChange);
		},
		set: (next) => {
			if (next === left) return;
			left = next;
			for (const fn of listeners) fn();
		},
	};
}

export const MapScrollContext = createContext<MapScroll | null>(null);

const atStart = () => 0;
const subscribeNever = () => () => {};

/**
 * The left edge of what shows of the map, in the drawing's units, `stickIn`
 * pixels in: where a name that must stay whole on screen is held (a
 * chapter's in Bands), whether the map's
 * camera moves it (Home) or the page scrolls it (the course page).
 */
export function useFrameLeft(stickIn: number): number {
	const scroll = useContext(MapScrollContext);
	const scrolled = useSyncExternalStore(scroll?.subscribe ?? subscribeNever, scroll?.left ?? atStart, atStart);
	return useStore((s) => (scrolled - s.transform[0] + stickIn) / s.transform[2]);
}
