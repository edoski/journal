"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import type { TakeLine } from "@/components/start/use-lesson-start";
import { LinkedColumns } from "@/components/linked-columns/linked-columns";
import type { ArcHandle, CourseStanding, TopicHandle } from "@/src/core";
import { drawingOf } from "@/components/course-map/topic-map/map-drawing";
import { PageFrame } from "@/components/page-frame/page-frame";
import { cn } from "@/lib/utils";
import { CourseHead, arcOnPage } from "@/components/course-page/course-head/course-head";
import { CourseNow } from "@/components/course-page/course-head/course-now";
import { CourseComposer } from "@/components/course-page/course-composer";
import { RoadList } from "@/components/course-page/road/road-list";
import { openingArc, type CourseArcSection, type CourseGroup, type CourseView } from "@/components/course-page/course-model";
import type { SplitListHandle } from "@/components/course-page/split/split-list";
import { SplitMap, type SplitMapHandle } from "@/components/course-page/split/split-map";
import { OPEN_AT_FIRST, aimOf, shownGroups } from "@/components/course-page/split/split-tie";
import { useMapTie, type PointBy } from "@/components/course-map/use-map-tie";
import { useListWalk } from "@/components/list-walk/use-list-walk";

/** What the course page's head and road are handed by the page they sit
 *  in (`SplitBody`): the course, the arc the map shows and which sections
 *  are open, and the tie to the map. */
export interface CourseColumns {
	view: CourseView;
	standing: CourseStanding | null;
	busy: boolean;
	/** Take up Now's line, its step included (`takeLine`). */
	onContinue: TakeLine;
	/** The groups with topics, for a course without arcs. */
	groups: readonly CourseGroup[];
	/** The arc the map shows, of a course with arcs. */
	shown: CourseArcSection | null;
	/** Shows an arc on the map, and opens it in the list. */
	showArc: (arc: ArcHandle) => void;
	open: Readonly<Record<string, boolean>>;
	onOpenChange: (id: string, open: boolean) => void;
	/** The topic he points at on the map, whose row the list marks. */
	marked: TopicHandle | null;
	/** A row he points at or focuses, or none (`useMapTie`). */
	onPoint: (handle: TopicHandle | null, by?: PointBy) => void;
	/** The list's handle, which the map hands the walk back to. */
	listRef: RefObject<SplitListHandle | null>;
	onEnterMap: (handle: TopicHandle) => void;
	/** The page's list walk (`useListWalk`): Up from the road's first stop reaches Now's row. */
	onWalkKey: (e: KeyboardEvent<HTMLElement>) => void;
}

/**
 * The course page under the course frame (spec: split-course.md), in the
 * shared page frame: the head across the column (`CourseHead`), then the
 * road on the left (`RoadList`) beside the course's map filling the right,
 * then New lesson's composer with this course chosen across the foot.
 * Pointing at a row lights its topic and prerequisites on the map and
 * brings it into view; pointing at a node marks its row. A click on either
 * opens the topic's page. The page fits the window; each pane scrolls
 * inside itself. A course with arcs shows one arc on the map, where he is
 * on arrival: opening an arc on the road shows it on the map, and showing
 * one on the map (⇧↑ ⇧↓, ⌘J) opens it on the road. The map lists no arcs
 * of its own, since the road is the course's one list of them. Enlarged,
 * as Home's map enlarges, the map takes the page's body across the whole
 * window: Now, the road and the composer give way, kept as they were for
 * its return, with the arc it shows.
 */
export function SplitBody({ view, standing, busy, onContinue }: { view: CourseView; standing: CourseStanding | null; busy: boolean; onContinue: TakeLine }) {
	const { map } = view.course;
	const { arcs } = view;
	const groups = useMemo(() => shownGroups(view.groups), [view.groups]);
	// `?arc=` (the head's arc pill, a topic head's) shows that arc; else where he is.
	const asked = useSearchParams().get("arc");
	const askedArc = arcs?.some((a) => a.arc.handle === asked) ? (asked as ArcHandle) : null;
	const [shownArc, setShownArc] = useState<ArcHandle | null>(() => (arcs ? (askedArc ?? openingArc(arcs)) : null));
	const [open, setOpen] = useState<Readonly<Record<string, boolean>>>(() => (arcs ? (shownArc ? { [shownArc]: true } : {}) : OPEN_AT_FIRST));
	const [lastAsked, setLastAsked] = useState(askedArc);
	if (lastAsked !== askedArc) {
		setLastAsked(askedArc);
		if (askedArc) {
			setShownArc(askedArc);
			setOpen((was) => (was[askedArc] ? was : { ...was, [askedArc]: true }));
		}
	}
	const shown = arcs?.find((a) => a.arc.handle === shownArc) ?? null;
	// The map's drawing, for the topic it opens on.
	const layout = useMemo(() => drawingOf(map, shown?.arc.handle).layout, [shown, map]);
	const aim = useMemo(() => aimOf(map.current, view.next.lesson.topics, shown ? [{ id: shown.arc.handle, topics: shown.topics }] : groups, layout), [map.current, view.next.lesson.topics, shown, groups, layout]);
	const [enlarged, setEnlarged] = useState(false);
	/** The shown arc, kept in the address, so the head's pill (`?arc=`) always moves to it. */
	const show = (arc: ArcHandle) => {
		setShownArc(arc);
		setLastAsked(arc);
		window.history.replaceState(null, "", arcOnPage(map.workspace, arc));
	};
	/** Opening an arc shows it on the map. */
	const onOpenChange = (id: string, to: boolean) => {
		setOpen((was) => ({ ...was, [id]: to }));
		if (arcs && to) show(id as ArcHandle);
	};
	/** An arc shown on the map (its list, ⇧↑ ⇧↓, H, a card's "From" line) opens in the list. */
	const showArc = (arc: ArcHandle) => {
		show(arc);
		setOpen((was) => (was[arc] ? was : { ...was, [arc]: true }));
	};
	// A row lights its topic with its whole prerequisite chain, as a hover on the map does.
	const tie = useMapTie({ chain: map.edges });
	const headerBox = useRef<HTMLDivElement>(null);
	const list = useRef<SplitListHandle>(null);
	const drawing = useRef<SplitMapHandle>(null);

	// The road walks as every page's list does; its head is Now's row: Up from the first stop reaches it, Down returns.
	const walk = useListWalk({
		stops: () => list.current?.stops() ?? [],
		head: () => headerBox.current?.querySelector<HTMLElement>("[data-slot=course-action]") ?? null,
	});

	const columns: CourseColumns = {
		view,
		standing,
		busy,
		onContinue,
		groups,
		shown,
		showArc,
		open,
		onOpenChange,
		marked: tie.row,
		onPoint: (handle, by) => tie.pointTopic("list", handle, by),
		listRef: list,
		onEnterMap: (to) => drawing.current?.focus(to),
		onWalkKey: walk.onKeyDown,
	};

	return (
		<PageFrame className={cn("h-full", enlarged && "max-w-none")}>
			<div ref={headerBox} className="contents" onKeyDown={walk.onHeadKeyDown}>
				<CourseHead {...columns} />
				{!enlarged && <CourseNow {...columns} />}
			</div>
			{map.topics.length === 0 ? (
				<p data-slot="course-notice" className="flex min-h-8 items-center text-body text-muted-foreground">
					Topics appear as you study this course.
				</p>
			) : (
				<LinkedColumns
					data-slot="course-split"
					data-enlarged={enlarged || undefined}
					listHidden={enlarged}
					list={<RoadList {...columns} />}
					map={
						<SplitMap
							key={map.workspace}
							ref={drawing}
							map={map}
							arc={shownArc ?? undefined}
							arcs={arcs?.map((a) => a.arc) ?? null}
							said={view.said}
							lights={tie.lights}
							aim={aim}
							onPoint={(handle, by) => tie.pointTopic("map", handle, by)}
							onLeave={(to) => list.current?.focus(to)}
							onOpenArc={showArc}
							enlarged={enlarged}
							onEnlarge={setEnlarged}
						/>
					}
				/>
			)}
			{!enlarged && <CourseComposer course={{ workspace: map.workspace, title: map.title }} />}
		</PageFrame>
	);
}
