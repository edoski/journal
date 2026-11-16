"use client";

import type { ArcHandle, CourseMapArc } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { mathPlain } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";
import { ArcLabel } from "./topic-map/arcs/arc-label";

/**
 * Every arc of the course, top to bottom in study order, beside Stacked
 * arcs' map (stack.md): each named as Bands names a chapter (`ArcLabel`,
 * its number and whole name, quiet), the arc shown bright, each a press that
 * glides the map there. The list never moves: its rows hold their place
 * whichever arc shows, so he reads where he is in the course at a glance
 * (Edo, 16 Nov 2026: "copy the arc display just for the arcs of the bands
 * variant"; and on the selector it replaced, "plenty of layout shift… I'm
 * not able to orient myself in it").
 */
export function ArcIndex({ arcs, value, onSelect, className }: { arcs: readonly CourseMapArc[]; value: ArcHandle | null; onSelect: (arc: ArcHandle) => void; className?: string }) {
	return (
		<nav data-slot="arc-index" aria-label="Arcs" className={cn("flex flex-col", className)}>
			{arcs.map((arc, i) => {
				const shown = arc.handle === value;
				return (
					<button
						key={arc.handle}
						type="button"
						data-slot="arc-index-row"
						data-arc={arc.handle}
						data-shown={shown || undefined}
						aria-current={shown ? "true" : undefined}
						aria-label={mathPlain(arc.title)}
						onClick={(e) => {
							blurAfterPointerClick(e);
							onSelect(arc.handle);
						}}
						className="lh-no-drag group/arc flex min-h-7 items-center rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ArcLabel
							number={i + 1}
							handle={arc.handle}
							title={arc.title}
							here={shown}
							className="whitespace-normal transition-colors group-hover/arc:text-foreground motion-reduce:transition-none"
						/>
					</button>
				);
			})}
		</nav>
	);
}
