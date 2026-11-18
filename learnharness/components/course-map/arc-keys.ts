"use client";

import { useEffect, useRef } from "react";
import { isTypingSurface, type ArcHandle, type CourseMapArc } from "@/src/core";
import { overlayOpen } from "@/components/spatial-arrows";

/** The key that goes to "You are here" with ⌘ (Ctrl off a Mac): its arc, then its card, focused. One key on
 *  every page, and a ⌘ chord, so it never takes a letter from a composer (Edo, 17 Nov 2026). */
const GO_HERE = "j";

/**
 * Home's map keys (topic-map.md, Arcs; the cheat sheet's Home rows,
 * `home-arc-up`, `home-arc-down` and `home-here`): ⇧↑ and ⇧↓ pick the arc
 * above and below, and ⌘J goes to "You are here" from any arc of the course
 * (`onHere`), from anywhere on the page, a field included; the arrows wait
 * while a field has the key or something is open over it, and stop at the
 * first and last arc.
 */
export function useArcKeys(arcs: readonly CourseMapArc[] | null, value: ArcHandle | null, onSelect: (arc: ArcHandle) => void, onHere: () => void) {
	const at = arcs ? Math.max(0, arcs.findIndex((a) => a.handle === value)) : -1;
	const go = useRef({ above: arcs?.[at - 1] ?? null, below: arcs?.[at + 1] ?? null, onSelect, onHere });
	go.current = { above: arcs?.[at - 1] ?? null, below: arcs?.[at + 1] ?? null, onSelect, onHere };
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.altKey) return;
			if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === GO_HERE && !overlayOpen()) {
				e.preventDefault();
				go.current.onHere();
				return;
			}
			if (e.metaKey || e.ctrlKey || isTypingSurface(e) || overlayOpen()) return;
			if (!e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
			const to = e.key === "ArrowUp" ? go.current.above : go.current.below;
			if (!to) return;
			e.preventDefault();
			// Before a focused card's own arrow walk.
			e.stopPropagation();
			go.current.onSelect(to.handle);
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, []);
}
