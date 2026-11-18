"use client";

import { useCallback, useState, type ComponentProps, type ReactNode } from "react";
import type { ArcHandle, CourseMapArc } from "@/src/core";
import { ArcMap } from "@/components/course-map/arc-map";
import { MAP_FADE, vignette } from "@/components/course-map/map-fade";
import { EnlargeButton } from "@/components/course-map/enlarge-button";
import { WholeCourseButton } from "@/components/course-map/topic-map/whole-course-button";
import { cn } from "@/lib/utils";

/** What the frame hands its drawing. */
export interface MapView {
	/** Whether the drawing shows the whole course (Whole course pressed). */
	whole: boolean;
	/** The room the drawing leaves inside the fade. */
	margin: { x: number; y: number };
	/** Shows an arc, leaving Whole course: a card's "From" line. */
	pick: (arc: ArcHandle) => void;
}

/**
 * Home's map frame, which the course page's map is drawn in too (spec:
 * topic-map.md, Frame): a 32px head row, `lead` on its left (Home's course
 * tabs) and on its right the maps' Whole course control, only while the map
 * is enlarged and opens on less than the whole course (a course with arcs,
 * or `opensWhole` false), then Enlarge; under it the map with its arcs
 * (`ArcMap`), its edges faded by `MAP_FADE.page`. The frame holds Whole
 * course: showing another arc, or leaving the enlarged map, returns to the
 * opening view.
 */
export function MapFrame({
	lead,
	arcs,
	value,
	here,
	index,
	onArc,
	opensWhole,
	enlarged,
	onEnlarge,
	back,
	enlargeSlot,
	children,
	className,
	...rest
}: {
	lead?: ReactNode;
	arcs: readonly CourseMapArc[] | null;
	/** The arc shown. */
	value: ArcHandle | null;
	/** The arc he is in. */
	here: ArcHandle | null;
	/** Whether the map lists its arcs beside it (`ArcMap`'s `index`). */
	index?: boolean;
	/** Shows an arc: its list, ⇧↑ or ⇧↓, ⌘J. */
	onArc: (arc: ArcHandle) => void;
	/** Whether the drawing opens on the whole course; null until measured. */
	opensWhole: boolean | null;
	enlarged: boolean;
	onEnlarge: (enlarged: boolean) => void;
	/** Enlarge's label while enlarged, the way back. */
	back: string;
	enlargeSlot: string;
	children: (view: MapView) => ReactNode;
} & Omit<ComponentProps<"section">, "children">) {
	const [whole, setWhole] = useState(false);
	const [opened, setOpened] = useState({ enlarged, value });
	if (opened.enlarged !== enlarged || opened.value !== value) {
		setOpened({ enlarged, value });
		setWhole(false);
	}
	const canZoomOut = enlarged && (arcs !== null || opensWhole === false);
	const zoomedOut = canZoomOut && whole;
	const toggleWhole = useCallback(() => setWhole((w) => !w), []);
	const leaveWhole = useCallback(() => setWhole(false), []);
	const pick = useCallback(
		(arc: ArcHandle) => {
			setWhole(false);
			onArc(arc);
		},
		[onArc],
	);
	return (
		<section className={cn("relative flex min-h-0 flex-1 flex-col gap-2", className)} {...rest}>
			<div data-slot="map-frame-head" className="flex h-8 shrink-0 items-center justify-between gap-4">
				{lead}
				<div className="ml-auto flex shrink-0 items-center gap-1">
					{canZoomOut && <WholeCourseButton whole={zoomedOut} onToggle={toggleWhole} />}
					<EnlargeButton enlarged={enlarged} onEnlarge={onEnlarge} back={back} data-slot={enlargeSlot} className="-mr-2" />
				</div>
			</div>
			<ArcMap arcs={arcs} value={value} here={here} whole={zoomedOut} index={index} onSelect={pick} onHere={leaveWhole}>
				<div data-slot="map-frame-vignette" className="relative flex min-h-0 flex-1 flex-col" style={vignette("page")}>
					{children({ whole: zoomedOut, margin: MAP_FADE.page, pick })}
				</div>
			</ArcMap>
		</section>
	);
}
