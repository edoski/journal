"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode, type Ref } from "react";
import type { TopicHandle } from "@/src/core";
import { CourseGroup } from "@/components/course-page/course-group";
import { offersCheck, type CourseArcSection, type CourseGroup as Group, type CourseTopic } from "@/components/course-page/course-model";
import type { ArcLineProps } from "@/components/course-page/road/road-arc";
import { CourseTopicRow } from "@/components/course-page/course-topic-row";
import { cn } from "@/lib/utils";
import { stopKey, walkStops, type ListSection, type Stop } from "@/components/course-page/split/split-tie";
import type { PointBy } from "@/components/course-map/use-map-tie";

/** What the page asks of the list: focus a topic's row, and its walk's stops top to bottom. */
export interface SplitListHandle {
	focus: (handle: TopicHandle) => void;
	stops: () => HTMLElement[];
}

function reducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The split page's left pane (spec: split-course.md): the course's topics
 * in their groups, each a 32px row ending in its reason's icon and words,
 * flush right so they line up down the list (the title wraps first);
 * in a course with arcs (`arcs`), its arcs in study order instead, each a
 * folded line (`arcLine`, the road's) that opens on its topics, a ready one
 * with Check it (`onCheck`). Which sections are open is the page's (`open`,
 * `onOpenChange`), held for the visit only. Pointing at or focusing a row tells the page (`onPoint`); `marked`
 * is the topic he points at on the map, whose row holds the hover fill and
 * is brought into view. The pane scrolls with no bar showing; while more
 * is below (or above) its edge fades, so a cut list reads as one that
 * goes on.
 *
 * Keyboard, for an app where Tab is dead: the page's list walk
 * (`useListWalk`, list-walk.md, `onWalkKey`) walks each group's header and
 * the rows of the open groups (`walkStops`, read through `stops`). On a
 * header, Enter or Space opens or folds the group, Right opens it and Left
 * folds it; on a row, Right steps onto its topic on the map
 * (`onEnterMap`) and Enter or Space opens it. A topic the map hands back
 * (`focus`) opens its group if it is folded.
 */
export function SplitList({
	groups,
	arcs = null,
	open,
	onOpenChange,
	onCheck,
	checking = null,
	marked,
	onPoint,
	onEnterMap,
	onWalkKey,
	arcLine: ArcLine,
	after,
	ref,
}: {
	groups: readonly Group[];
	/** The course's arcs, which the list shows in place of its groups. */
	arcs?: readonly CourseArcSection[] | null;
	/** Which sections (groups, or arcs by handle) show their rows. */
	open: Readonly<Record<string, boolean>>;
	onOpenChange: (id: string, open: boolean) => void;
	/** Check it on a ready arc. */
	onCheck?: (section: CourseArcSection) => void;
	/** The arc whose check is starting. */
	checking?: string | null;
	marked: TopicHandle | null;
	onPoint: (handle: TopicHandle | null, by: PointBy) => void;
	onEnterMap: (handle: TopicHandle) => void;
	/** The page's list walk (`useListWalk`'s `onKeyDown`). */
	onWalkKey: (e: KeyboardEvent<HTMLElement>) => void;
	/** How an arc's line is drawn: the road's (`RoadLine`). */
	arcLine: ComponentType<ArcLineProps>;
	/** What closes the list, after its last section. */
	after?: ReactNode;
	ref?: Ref<SplitListHandle>;
}) {
	const viewport = useRef<HTMLDivElement>(null);
	/** Each stop's element: a header's button, a row's link. */
	const stopsEl = useRef(new Map<string, HTMLElement>());
	const sections = useMemo<ListSection[]>(
		() => (arcs ? arcs.map((a) => ({ id: a.arc.handle, topics: a.topics, checkable: offersCheck(a) && onCheck !== undefined })) : [...groups]),
		[arcs, groups, onCheck],
	);
	const stops = useMemo(() => walkStops(sections, open), [sections, open]);
	const [more, setMore] = useState({ above: false, below: false });
	/** A topic the map handed back while its group was folded: focused once the group opens. */
	const pending = useRef<TopicHandle | null>(null);

	const openGroup = (id: string, to: boolean) => {
		if (Boolean(open[id]) !== to) onOpenChange(id, to);
	};
	const register = (stop: Stop) => (el: HTMLElement | null) => {
		if (el) stopsEl.current.set(stopKey(stop), el);
		else stopsEl.current.delete(stopKey(stop));
	};

	useImperativeHandle(
		ref,
		() => ({
			focus: (handle) => {
				const row = stopsEl.current.get(stopKey({ kind: "row", handle }));
				if (row) return row.focus();
				const section = sections.find((g) => g.topics.some((t) => t.topic.handle === handle));
				if (!section) return;
				pending.current = handle;
				onOpenChange(section.id, true);
			},
			stops: () => stops.flatMap((stop) => stopsEl.current.get(stopKey(stop)) ?? []),
		}),
		[sections, stops, onOpenChange],
	);

	useEffect(() => {
		const handle = pending.current;
		if (!handle) return;
		pending.current = null;
		stopsEl.current.get(stopKey({ kind: "row", handle }))?.focus();
	}, [open]);

	/** Whether rows are hidden above or below the pane's edges. */
	const measure = useCallback(() => {
		const el = viewport.current;
		if (!el) return;
		const above = el.scrollTop > 1;
		const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
		setMore((was) => (was.above === above && was.below === below ? was : { above, below }));
	}, []);

	useEffect(() => {
		const el = viewport.current;
		if (!el) return;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		if (el.firstElementChild) observer.observe(el.firstElementChild);
		return () => observer.disconnect();
	}, [measure]);

	// The row of the topic he points at on the map comes into view, moving the pane as little as it can.
	useEffect(() => {
		const row = marked ? stopsEl.current.get(stopKey({ kind: "row", handle: marked })) : null;
		// Its scroll padding keeps room for the row's focus ring.
		row?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth", container: "nearest" } as ScrollIntoViewOptions);
	}, [marked]);

	const onHeaderKeyDown = (id: string, e: KeyboardEvent<HTMLButtonElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
			e.preventDefault();
			openGroup(id, e.key === "ArrowRight");
		}
	};

	const onRowKeyDown = (row: CourseTopic, e: KeyboardEvent<HTMLAnchorElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		const handle = row.topic.handle;
		if (e.key === "ArrowRight") {
			e.preventDefault();
			onEnterMap(handle);
			return;
		}
		if (e.key === " ") {
			e.preventDefault();
			e.currentTarget.click();
		}
	};

	const row = (row: CourseTopic) => (
		<CourseTopicRow
			key={row.topic.handle}
			row={row}
			// The compact row's 32px with the reason's words showing, so the fullest demo course fits at 1440x900; a long
			// title wraps onto a second line rather than being cut (round 15, 1 m8).
			compact
			highlighted={marked === row.topic.handle}
			ref={register({ kind: "row", handle: row.topic.handle })}
			onMouseEnter={() => onPoint(row.topic.handle, "pointer")}
			onMouseLeave={() => onPoint(null, "pointer")}
			onFocus={() => onPoint(row.topic.handle, "focus")}
			onBlur={() => onPoint(null, "focus")}
			onKeyDown={(e) => onRowKeyDown(row, e)}
		/>
	);

	return (
		<section aria-label="Topics" data-slot="course-split-list" onKeyDown={onWalkKey} className="flex min-h-0 flex-1 flex-col">
			{/* The rows' hover fill and focus ring reach 12px past the column; the pane makes room for them. */}
			<div
				ref={viewport}
				onScroll={measure}
				data-slot="course-split-list-scroller"
				data-more-above={more.above || undefined}
				data-more-below={more.below || undefined}
				className={cn(
					"-mx-3.5 min-h-0 flex-1 scroll-py-1 overflow-y-auto overscroll-contain px-3.5 pb-1",
					more.below && "mask-b-from-[calc(100%-2.5rem)]",
					more.above && "mask-t-from-[calc(100%-2.5rem)]",
				)}
			>
				<div className={cn("flex flex-col", arcs ? "gap-0.5" : "gap-4")}>
					{arcs
						? arcs.map((section) => (
								<ArcLine
									key={section.arc.handle}
									section={section}
									items={section.topics}
									open={Boolean(open[section.arc.handle])}
									onOpenChange={(to) => openGroup(section.arc.handle, to)}
									onCheck={onCheck && (() => onCheck(section))}
									checking={checking === section.arc.handle}
									headerRef={register({ kind: "group", id: section.arc.handle })}
									checkRef={register({ kind: "check", id: section.arc.handle })}
									onHeaderKeyDown={(e) => onHeaderKeyDown(section.arc.handle, e)}
									renderItem={row}
								/>
							))
						: groups.map((group) => (
								<CourseGroup
									key={group.id}
									data-group={group.id}
									title={group.title}
									items={group.topics}
									foldable
									open={Boolean(open[group.id])}
									onOpenChange={(to) => openGroup(group.id, to)}
									headerRef={register({ kind: "group", id: group.id })}
									onHeaderKeyDown={(e) => onHeaderKeyDown(group.id, e)}
									renderItem={row}
								/>
							))}
					{after}
				</div>
			</div>
		</section>
	);
}
