"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ArcHandle, CourseMapArc } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { mathPlain } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";
import { ArcLabel } from "./arc-label";

/** A one-line row's height; a name on two lines makes its row taller, by
 *  its line and no more, so the list takes the room it took when every name
 *  had one line (round 18, m11). */
const ROW = 24;

/**
 * Every arc of the course, top to bottom in study order, beside Home's map
 * (topic-map.md, Arcs): each named quietly (`ArcLabel`, its number and
 * whole name), the arc shown bright, each a press that
 * glides the map there. The rows hang off a hairline track, the course tabs'
 * underline turned on its side, so the arcs read as parts of the course
 * above; a bar on the track slides to the arc shown, as the tabs' underline
 * slides to the course, and a dot in the ink of "You are here"'s ring marks
 * the arc he is in. A name takes a second line before it is cut, as the
 * course page's road gives it (round 18, m11: "Discrete probability and the
 * unifor…"), and the bar takes the shown row's place and height. The rows
 * never move, whichever arc shows (Edo, 16 Nov
 * 2026: "how can I tell which arc I'm at?… extremely compact and minimalist"; "not
 * clear enough boundary and hierarchy… arcs are something that's contained
 * within a course").
 */
export function ArcIndex({ arcs, value, here, onSelect, className }: { arcs: readonly CourseMapArc[]; value: ArcHandle | null; here: ArcHandle | null; onSelect: (arc: ArcHandle) => void; className?: string }) {
	const at = arcs.findIndex((a) => a.handle === value);
	const nav = useRef<HTMLElement>(null);
	// The shown row's place and height, measured, since a two-line name makes its row taller.
	const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
	useLayoutEffect(() => {
		const list = nav.current;
		if (!list || at < 0) return;
		const measure = () => {
			const row = list.querySelectorAll<HTMLElement>('[data-slot="arc-index-row"]')[at];
			if (row) setBar((was) => (was && was.top === row.offsetTop && was.height === row.offsetHeight ? was : { top: row.offsetTop, height: row.offsetHeight }));
		};
		measure();
		const sizes = new ResizeObserver(measure);
		sizes.observe(list);
		return () => sizes.disconnect();
	}, [at, arcs]);
	return (
		<nav ref={nav} data-slot="arc-index" aria-label="Arcs" className={cn("relative flex flex-col border-l border-white/10 pl-4", className)}>
			{at >= 0 && (
				<span
					aria-hidden="true"
					data-slot="arc-index-bar"
					className="pointer-events-none absolute top-0 -left-px w-0.5 rounded-full bg-foreground transition-[transform,height] duration-200 ease-out motion-reduce:transition-none"
					style={{ height: bar?.height ?? ROW, transform: `translateY(${bar?.top ?? at * ROW}px)` }}
				/>
			)}
			{arcs.map((arc, i) => {
				const shown = i === at;
				const isHere = arc.handle === here;
				return (
					<button
						key={arc.handle}
						type="button"
						data-slot="arc-index-row"
						data-arc={arc.handle}
						data-shown={shown || undefined}
						data-here={isHere || undefined}
						aria-current={shown ? "true" : undefined}
						aria-label={isHere ? `${mathPlain(arc.title)}, you are here` : mathPlain(arc.title)}
						onClick={(e) => {
							blurAfterPointerClick(e);
							onSelect(arc.handle);
						}}
						className="lh-no-drag group/arc flex items-center gap-2 rounded-md py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
						style={{ minHeight: ROW }}
					>
						<ArcLabel number={i + 1} handle={arc.handle} title={arc.title} here={shown} wrap />
						{isHere && <span aria-hidden="true" data-slot="arc-index-here" className="size-1.5 shrink-0 rounded-full bg-ring" />}
					</button>
				);
			})}
		</nav>
	);
}
