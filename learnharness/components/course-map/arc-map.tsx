"use client";

import { useCallback, useRef, type ReactNode } from "react";
import type { ArcHandle, CourseMapArc } from "@/src/core";
import { cn } from "@/lib/utils";
import { ArcIndex } from "./arc-index";
import { useArcKeys } from "./arc-keys";

/** How many frames H waits for "You are here"'s card to be drawn, about a second. */
const FIND_HERE_FRAMES = 60;

/**
 * Every course map with its arcs (topic-map.md, Arcs): Home's, the enlarged
 * map's and the course page's. A course with arcs lists them in a column of
 * its own left of the drawing (`ArcIndex`), the drawing framing each arc in
 * the room beside it; ⇧↑ and ⇧↓ pick the arc above and below, and H goes to
 * "You are here" from any arc: its arc, then its card, focused (`useArcKeys`).
 * A course without arcs is its drawing alone, H still focusing its card.
 * `value` is the arc shown; `whole` says the drawing shows the whole course,
 * so no arc is marked. `onHere` is what else H does on the page (leaving
 * Whole course). `children` is the drawing.
 */
export function ArcMap({
	arcs,
	value,
	here,
	whole = false,
	onSelect,
	onHere,
	children,
}: {
	arcs: readonly CourseMapArc[] | null;
	value: ArcHandle | null;
	here: ArcHandle | null;
	whole?: boolean;
	onSelect: (arc: ArcHandle) => void;
	onHere?: () => void;
	children: ReactNode;
}) {
	const root = useRef<HTMLDivElement>(null);
	const goHere = useCallback(() => {
		if (here) onSelect(here);
		onHere?.();
		// The card mounts once its arc is drawn, so look for it each frame until it is there.
		let frames = FIND_HERE_FRAMES;
		const find = () => {
			const cards = root.current?.querySelectorAll<HTMLElement>('[data-slot="course-map-node"][data-current]') ?? [];
			const card = [...cards].find((el) => !el.closest('[inert], [data-slot="course-map-trail"]'));
			if (card) card.focus({ preventScroll: true });
			else if (--frames > 0) requestAnimationFrame(find);
		};
		requestAnimationFrame(find);
	}, [here, onSelect, onHere]);
	useArcKeys(arcs, value, onSelect, goHere);
	return (
		<div ref={root} data-slot="arc-map" className="flex min-h-0 flex-1">
			{arcs && <ArcIndex className="mt-6 w-64 shrink-0 self-start" arcs={arcs} value={whole ? null : value} here={here} onSelect={onSelect} />}
			<div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", arcs && "ml-8")}>{children}</div>
		</div>
	);
}
