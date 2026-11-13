"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { PANES_GRID, type PanesProps } from "@/components/unit-inbox/topic-page/link/link-panes";
import { cn } from "@/lib/utils";

/** The selected row, and the step its lesson stopped on. */
const ROW = '[data-slot="topic-history"] [data-shown]';
const STEP = '[data-slot="topic-step"][aria-current="step"]';

/** The radius of the connector's one bend. */
const BEND = 8;

/** Where the connector runs, in the panes' own pixels; null when either end is out of view. */
export interface LinkEnds {
	from: { x: number; y: number };
	to: { x: number; y: number };
}

/** From the row's right edge, which is the middle of the gap between the
 *  panes, down the gap to the step's height, then across to its left edge:
 *  one rounded bend, so the line never cuts across the list. */
export function connectorPath({ from, to }: LinkEnds): string {
	const rise = to.y - from.y;
	if (Math.abs(rise) < BEND * 2) return `M ${from.x} ${from.y} C ${from.x + BEND * 2} ${from.y}, ${from.x + BEND * 2} ${to.y}, ${from.x + BEND * 4} ${to.y} H ${to.x}`;
	const down = Math.sign(rise);
	return `M ${from.x} ${from.y} V ${to.y - down * BEND} Q ${from.x} ${to.y}, ${from.x + BEND} ${to.y} H ${to.x}`;
}

/** A rect's middle is inside its clip. */
const inside = (rect: DOMRect, clip: DOMRect) => {
	const y = rect.top + rect.height / 2;
	return y >= clip.top && y <= clip.bottom && rect.right > clip.left && rect.left < clip.right;
};

/**
 * Link option "connected" (spec: link.md): the panes as they are, with a
 * thin line from the selected row to the step its lesson stopped on, and
 * two-way hover (the line runs down the gap, then under the map's steps): pointing at that row lights the step, pointing at the
 * step lights the row (`data-lit`, which the row and the step answer with
 * `in-data-[lit]`), and the line takes the ring's ink. The line follows
 * the list's scroll and the map's pan, and leaves while either end is out
 * of view.
 */
export function ConnectedPanes({ side, map }: PanesProps) {
	const panes = useRef<HTMLDivElement>(null);
	const [ends, setEnds] = useState<LinkEnds | null>(null);
	const [lit, setLit] = useState(false);

	const measure = useCallback(() => {
		const root = panes.current;
		if (!root) return;
		const row = root.querySelector(ROW);
		const step = root.querySelector(STEP);
		const list = root.querySelector('[data-slot="topic-history"]');
		const frame = root.querySelector('[data-slot="topic-lesson-map"]');
		if (!row || !step || !list || !frame) return setEnds(null);
		const r = row.getBoundingClientRect();
		const s = step.getBoundingClientRect();
		if (!inside(r, list.getBoundingClientRect()) || !inside(s, frame.getBoundingClientRect())) return setEnds(null);
		const o = root.getBoundingClientRect();
		const next = { from: { x: r.right - o.left, y: r.top + r.height / 2 - o.top }, to: { x: s.left - o.left, y: s.top + s.height / 2 - o.top } };
		setEnds((prev) => (prev && connectorPath(prev) === connectorPath(next) ? prev : next));
	}, []);

	useLayoutEffect(() => {
		const root = panes.current;
		if (!root) return;
		let frame = 0;
		const soon = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		};
		soon();
		const resize = new ResizeObserver(soon);
		resize.observe(root);
		// The map pans by restyling its viewport, and a row is selected by an attribute.
		const changes = new MutationObserver(soon);
		changes.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "data-shown", "aria-current"] });
		root.addEventListener("scroll", soon, { capture: true, passive: true });
		return () => {
			cancelAnimationFrame(frame);
			resize.disconnect();
			changes.disconnect();
			root.removeEventListener("scroll", soon, { capture: true });
		};
	}, [measure]);

	const point = (target: EventTarget | null) => setLit(target instanceof Element && target.closest(`${ROW}, ${STEP}`) !== null);

	return (
		<div
			ref={panes}
			data-slot="topic-panes"
			data-link="connected"
			data-lit={lit || undefined}
			onPointerOver={(event) => point(event.target)}
			onPointerLeave={() => setLit(false)}
			onFocus={(event) => point(event.target)}
			onBlur={() => setLit(false)}
			className={`${PANES_GRID} relative gap-6`}
		>
			<svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
				{ends && (
					<g data-slot="topic-link" className={cn("transition-colors duration-150 motion-reduce:transition-none", lit ? "stroke-ring text-ring" : "stroke-white/25 text-white/25")}>
						<path d={connectorPath(ends)} fill="none" strokeWidth={1} />
						<circle cx={ends.from.x} cy={ends.from.y} r={2} className="fill-current stroke-none" />
						<circle cx={ends.to.x} cy={ends.to.y} r={2} className="fill-current stroke-none" />
					</g>
				)}
			</svg>
			{side}
			{map}
		</div>
	);
}
