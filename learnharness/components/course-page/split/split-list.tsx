"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import type { TopicHandle } from "@/src/core";
import { CourseGroup } from "@/components/course-page/course-group";
import type { CourseGroup as Group, CourseTopic } from "@/components/course-page/course-model";
import { CourseTopicRow } from "@/components/course-page/course-topic-row";
import { cn } from "@/lib/utils";
import { scrollToShow, walkTo } from "@/components/course-page/split/split-tie";

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
 * Every topic shows, none folded away, so each node on the map has its
 * row. Pointing at or focusing a row tells the page (`onPoint`); `marked`
 * is the topic he points at on the map, whose row holds the hover fill and
 * is brought into view. The pane scrolls with no bar showing; while more
 * is below (or above) its edge fades, so a cut list reads as one that
 * goes on.
 *
 * Keyboard, for an app where Tab is dead: with nothing focused, Down or
 * Home steps onto the first row and Up or End onto the last; on a row,
 * Up, Down, Home and End walk the rows, Up on the first leaves for the
 * header's button (`onExitTop`), Right steps onto its topic on the map
 * (`onEnterMap`), Enter or Space opens it, and Escape leaves the walk.
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
	const rows = useRef(new Map<TopicHandle, HTMLAnchorElement>());
	const order = useMemo(() => groups.flatMap((g) => g.topics.map((t) => t.topic.handle)), [groups]);
	const [more, setMore] = useState({ above: false, below: false });

	useImperativeHandle(
		ref,
		() => ({
			focus: (handle) => rows.current.get(handle)?.focus(),
			focusFirst: () => (order[0] ? rows.current.get(order[0])?.focus() : undefined),
		}),
		[order],
	);

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
		const row = marked ? rows.current.get(marked) : null;
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
			const to = walkTo(e.key, null, order.length);
			if (to === null) return;
			e.preventDefault();
			rows.current.get(order[to]!)?.focus();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [order]);

	const onRowKeyDown = (row: CourseTopic, e: KeyboardEvent<HTMLAnchorElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		const handle = row.topic.handle;
		const at = order.indexOf(handle);
		if (e.key === "ArrowRight") {
			e.preventDefault();
			onEnterMap(handle);
			return;
		}
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			e.currentTarget.blur();
			return;
		}
		if (e.key === " ") {
			e.preventDefault();
			e.currentTarget.click();
			return;
		}
		if (e.key === "ArrowUp" && at === 0 && onExitTop) {
			e.preventDefault();
			onExitTop();
			return;
		}
		const to = walkTo(e.key, at, order.length);
		if (to === null) return;
		e.preventDefault();
		rows.current.get(order[to]!)?.focus();
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
							renderItem={(row) => (
								<CourseTopicRow
									key={row.topic.handle}
									row={row}
									// The compact row's 32px with the reason's words showing, so the fullest demo course fits at 1440x900.
									className="h-8"
									highlighted={marked === row.topic.handle}
									ref={(el: HTMLAnchorElement | null) => {
										if (el) rows.current.set(row.topic.handle, el);
										else rows.current.delete(row.topic.handle);
									}}
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
