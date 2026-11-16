"use client";

import { useLayoutEffect, useRef } from "react";
import type { FrameProps } from "../map-skin";
import { CanvasFrame } from "../canvas/canvas-frame";
import { drawingOfLayout } from "./neighbours-skin";

/** The map's own glide (topic-map.tsx): 200ms, fast out and settling in. */
const GLIDE = { duration: 200, easing: "cubic-bezier(0.33, 1, 0.68, 1)" };

/**
 * Tree and neighbours' frame: Canvas tree's focus, and the glide when
 * another arc loads, the drawing arriving from the side it was on (the arc
 * after rises from below, the arc before drops from above), as the map's
 * own camera glides. Nothing moves under reduced motion.
 */
export function NeighboursFrame(props: FrameProps) {
	const box = useRef<HTMLDivElement>(null);
	const number = drawingOfLayout(props.layout)?.number ?? null;
	const was = useRef(number);
	useLayoutEffect(() => {
		const from = was.current;
		was.current = number;
		if (from === null || number === null || from === number || !box.current?.animate) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const dy = number > from ? 48 : -48;
		box.current.animate([{ transform: `translateY(${dy}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], GLIDE);
	}, [number]);
	return (
		<div ref={box} data-slot="neighbours-frame" className="size-full">
			<CanvasFrame {...props} />
		</div>
	);
}
