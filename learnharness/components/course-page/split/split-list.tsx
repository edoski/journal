"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import type { TopicHandle } from "@/src/core";
import { CourseGroup } from "@/components/course-page/course-group";
import type { CourseGroup as Group, CourseTopic, GroupId } from "@/components/course-page/course-model";
import { CourseTopicRow } from "@/components/course-page/course-topic-row";
import { cn } from "@/lib/utils";
import { OPEN_AT_FIRST, scrollToShow, stopKey, walkStops, walkTo, type Stop } from "@/components/course-page/split/split-tie";

/** What the page asks of the list: focus a topic's row, or its first. */
export interface SplitListHandle {
	focus: (handle: TopicHandle) => void;
	focusFirst: () => void;
}

/** Room kept clear above and below a row brought into view: its focus ring. */
const RING_ROOM = 4;

function reducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The split page's left pane (spec: split-course.md): the course's topics
 * in their groups, each a 32px row ending in its reason's icon and words,
 * flush right so they line up down the list (the title truncates first).
 * Needs you and Learning open, Not started and On your own folded under
 * their headers (`OPEN_AT_FIRST`); a header opens or folds its group, held
 * for the visit only. Pointing at or focusing a row tells the page (`onPoint`); `marked`
 * is the topic he points at on the map, whose row holds the hover fill and
 * is brought into view. The pane scrolls with no bar showing; while more
 * is below (or above) its edge fades, so a cut list reads as one that
 * goes on.
 *
 * Keyboard, for an app where Tab is dead: the arrows walk each group's
 * header and the rows of the open groups (`walkStops`). With nothing
 * focused, Down or Home steps onto the first stop and Up or End onto the
 * last; Up, Down, Home and End walk, Up on the first leaves for the
 * page head's button (`onExitTop`), and Escape leaves the walk. On a
 * header, Enter or Space opens or folds the group, Right opens it and Left
 * folds it; on a row, Right steps onto its topic on the map
 * (`onEnterMap`) and Enter or Space opens it. A topic the map hands back
 * (`focus`) opens its group if it is folded.
 */
export function SplitList({
	groups,
	marked,
	onPoint,
	onEnterMap,
	onExitTop,
	ref,
}: {
	groups: readonly Group[];
	marked: TopicHandle | null;
	onPoint: (handle: TopicHandle | null) => void;
	onEnterMap: (handle: TopicHandle) => void;
	onExitTop?: () => void;
	ref?: Ref<SplitListHandle>;
}) {
	const viewport = useRef<HTMLDivElement>(null);
	/** Each stop's element: a header's button, a row's link. */
	const stopsEl = useRef(new Map<string, HTMLElement>());
	const [open, setOpen] = useState(OPEN_AT_FIRST);
	const stops = useMemo(() => walkStops(groups, open), [groups, open]);
	const [more, setMore] = useState({ above: false, below: false });
	/** A topic the map handed back while its group was folded: focused once the group opens. */
	const pending = useRef<TopicHandle | null>(null);

	const focusStop = (stop: Stop | undefined) => (stop ? stopsEl.current.get(stopKey(stop))?.focus() : undefined);
	const openGroup = (id: GroupId, to: boolean) => setOpen((was) => (was[id] === to ? was : { ...was, [id]: to }));
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
				const group = groups.find((g) => g.topics.some((t) => t.topic.handle === handle));
				if (!group) return;
				pending.current = handle;
				setOpen((was) => ({ ...was, [group.id]: true }));
			},
			focusFirst: () => focusStop(stops[0]),
		}),
		[groups, stops],
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
		const view = viewport.current;
		if (!row || !view) return;
		const top = row.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
		const to = scrollToShow({ top, height: row.offsetHeight }, { scrollTop: view.scrollTop, height: view.clientHeight }, RING_ROOM);
		if (to !== null) view.scrollTo({ top: to, behavior: reducedMotion() ? "auto" : "smooth" });
	}, [marked]);

	// With nothing focused, an arrow steps into the list.
	useEffect(() => {
		const onKeyDown = (e: globalThis.KeyboardEvent) => {
			if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
			if (document.activeElement && document.activeElement !== document.body) return;
			const to = walkTo(e.key, null, stops.length);
			if (to === null) return;
			e.preventDefault();
			stopsEl.current.get(stopKey(stops[to]!))?.focus();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [stops]);

	/** The keys every stop shares: Up, Down, Home and End walk, Up on the first leaves the list, Escape leaves the walk. */
	const walk = (stop: Stop, e: KeyboardEvent<HTMLElement>) => {
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			e.currentTarget.blur();
			return;
		}
		const at = stops.findIndex((s) => stopKey(s) === stopKey(stop));
		if (e.key === "ArrowUp" && at === 0 && onExitTop) {
			e.preventDefault();
			onExitTop();
			return;
		}
		const to = walkTo(e.key, at, stops.length);
		if (to === null) return;
		e.preventDefault();
		focusStop(stops[to]);
	};

	const onHeaderKeyDown = (id: GroupId, e: KeyboardEvent<HTMLButtonElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
			e.preventDefault();
			openGroup(id, e.key === "ArrowRight");
			return;
		}
		walk({ kind: "group", id }, e);
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
			return;
		}
		walk({ kind: "row", handle }, e);
	};

	return (
		<section aria-label="Topics" data-slot="course-split-list" className="flex min-h-0 flex-1 flex-col">
			{/* The rows' hover fill and focus ring reach 12px past the column; the pane makes room for them. */}
			<div
				ref={viewport}
				onScroll={measure}
				data-slot="course-split-list-scroller"
				data-more-above={more.above || undefined}
				data-more-below={more.below || undefined}
				className={cn(
					"-mx-3.5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					more.below && "mask-b-from-[calc(100%-2.5rem)]",
					more.above && "mask-t-from-[calc(100%-2.5rem)]",
				)}
			>
				<div className="flex flex-col gap-4">
					{groups.map((group) => (
						<CourseGroup
							key={group.id}
							data-group={group.id}
							title={group.title}
							items={group.topics}
							foldable
							open={open[group.id]}
							onOpenChange={(to) => openGroup(group.id, to)}
							headerRef={register({ kind: "group", id: group.id })}
							onHeaderKeyDown={(e) => onHeaderKeyDown(group.id, e)}
							renderItem={(row) => (
								<CourseTopicRow
									key={row.topic.handle}
									row={row}
									// The compact row's 32px with the reason's words showing, so the fullest demo course fits at 1440x900.
									className="h-8"
									highlighted={marked === row.topic.handle}
									ref={register({ kind: "row", handle: row.topic.handle })}
									onMouseEnter={() => onPoint(row.topic.handle)}
									onMouseLeave={() => onPoint(null)}
									onFocus={() => onPoint(row.topic.handle)}
									onBlur={() => onPoint(null)}
									onKeyDown={(e) => onRowKeyDown(row, e)}
								/>
							)}
						/>
					))}
				</div>
			</div>
		</section>
	);
}
