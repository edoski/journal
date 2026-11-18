"use client";

import type { ArcHandle, CourseMapArc } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { mathPlain } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";
import { ArcLabel } from "./arc-label";

/** One row's height: every row holds it, so the bar slides by whole rows and nothing shifts. */
const ROW = 28;

/**
 * Every arc of the course, top to bottom in study order, beside Home's map
 * (topic-map.md, Arcs): each named quietly (`ArcLabel`, its number and
 * whole name), the arc shown bright, each a press that
 * glides the map there. The rows hang off a hairline track, the course tabs'
 * underline turned on its side, so the arcs read as parts of the course
 * above; a bar on the track slides to the arc shown, as the tabs' underline
 * slides to the course, and a dot in the ink of "You are here"'s ring marks
 * the arc he is in. The rows never move, whichever arc shows (Edo, 16 Nov
 * 2026: "how can I tell which arc I'm at?… extremely compact and minimalist"; "not
 * clear enough boundary and hierarchy… arcs are something that's contained
 * within a course").
 */
export function ArcIndex({ arcs, value, here, onSelect, className }: { arcs: readonly CourseMapArc[]; value: ArcHandle | null; here: ArcHandle | null; onSelect: (arc: ArcHandle) => void; className?: string }) {
	const at = arcs.findIndex((a) => a.handle === value);
	return (
		<nav data-slot="arc-index" aria-label="Arcs" className={cn("relative flex flex-col border-l border-white/10 pl-4", className)}>
			{at >= 0 && (
				<span
					aria-hidden="true"
					data-slot="arc-index-bar"
					className="pointer-events-none absolute top-0 -left-px w-0.5 rounded-full bg-foreground transition-transform duration-200 ease-out motion-reduce:transition-none"
					style={{ height: ROW, transform: `translateY(${at * ROW}px)` }}
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
						className="lh-no-drag group/arc flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
						style={{ height: ROW }}
					>
						<ArcLabel number={i + 1} handle={arc.handle} title={arc.title} here={shown} />
						{isHere && <span aria-hidden="true" data-slot="arc-index-here" className="size-1.5 shrink-0 rounded-full bg-ring" />}
					</button>
				);
			})}
		</nav>
	);
}
