"use client";

import { useEffect, useRef } from "react";
import { isTypingSurface, type ArcHandle, type CourseMapArc } from "@/src/core";
import { overlayOpen } from "@/components/spatial-arrows";

/** The keys that glide to the arc above and below. Not in the key registry while the style sits behind the map
 *  switch, so the cheat sheet never offers a key that Current ignores; it joins Home's keys there when it ships. */
export const ARC_UP = "shift+arrowup";
export const ARC_DOWN = "shift+arrowdown";

/**
 * ⇧↑ and ⇧↓ pick the arc above and below for Stacked arcs (stack.md), from
 * anywhere on the page, unless a field has the key or something is open
 * over it; they stop at the first and last arc.
 */
export function useArcKeys(arcs: readonly CourseMapArc[] | null, value: ArcHandle | null, onSelect: (arc: ArcHandle) => void, enabled: boolean) {
	const at = arcs ? Math.max(0, arcs.findIndex((a) => a.handle === value)) : -1;
	const go = useRef({ above: arcs?.[at - 1] ?? null, below: arcs?.[at + 1] ?? null, onSelect });
	go.current = { above: arcs?.[at - 1] ?? null, below: arcs?.[at + 1] ?? null, onSelect };
	useEffect(() => {
		if (!enabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
			if (isTypingSurface(e) || overlayOpen()) return;
			const to = e.key === "ArrowUp" ? go.current.above : go.current.below;
			if (!to) return;
			e.preventDefault();
			// Before a focused card's own arrow walk.
			e.stopPropagation();
			go.current.onSelect(to.handle);
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [enabled]);
}
