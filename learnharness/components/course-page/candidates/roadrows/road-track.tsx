"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, EllipsisIcon, ListChecksIcon } from "lucide-react";
import type { ArcHandle, TopicHandle } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Ring } from "@/components/ui/pie";
import { MathText } from "@/components/ui/math-text";
import { ARC_STATE_WORDS } from "@/components/study-words";
import { GROUP_WORDS, type CourseArcSection, type CourseTopic } from "@/components/course-page/course-model";
import { CHECK_WORDS } from "@/components/course-page/course-arc";
import { CourseTopicRow } from "@/components/course-page/course-topic-row";
import { ExamFact } from "@/components/course-page/course-head/head-parts";
import { useCourseRunup } from "@/components/course-page/course-head/use-course-runup";
import type { CourseColumns } from "@/components/course-page/split/split-course";
import { arcStarts, examStop, roadWindow } from "@/components/course-page/candidates/road/road-model";
import { trackItems, type TrackItem } from "@/components/course-page/candidates/roadrows/track-model";
import { cn } from "@/lib/utils";

/** The words the road's folds say. */
export const FOLD_WORDS = { earlier: "Earlier", later: "Later", between: "Show every arc", near: "Only what's near" } as const;

/** One stretch of the track: a hairline from this item's marker to the next item's, on the markers' centre line. */
const SEGMENT = "relative after:absolute after:top-[7.5px] after:left-2 after:right-0 after:h-px after:bg-white/15 after:content-[''] last:after:hidden";
/** What sits on the track, on the page's ground so the track runs behind it, never through it. */
const ON_TRACK = "relative z-10 flex h-4 shrink-0 items-center bg-background";
/** A row under a stop: 32px, the topic rows' height. */
const ROW = 32;
/** The track, a stop's name (two lines) and its fact, and the room above its topics. */
const HEAD = 16 + 8 + 40 + 20 + 8;

/** The topic of an arc a stop's pointer lights on the map: where he is, else what Today asks, else its first. */
function leadOf(section: CourseArcSection): TopicHandle | null {
	const lead = section.topics.find((t) => t.current) ?? section.topics.find((t) => t.group === "needs-you") ?? section.topics[0];
	return lead?.topic.handle ?? null;
}

/**
 * Road in rows' road (spec: roadrows.md): the course's road left to right
 * across the page under its map, each arc shown a stop on one hairline
 * track (its ring on the track, its name, its one fact), the exam a stop
 * where the plan reaches it. The arc the map shows is open, its topics
 * hanging under its stop; the others fold to their stop. Before the whole
 * road is asked for, only the stretch near him shows (`roadWindow`), the
 * arcs folded away a quiet press on the track where they would be:
 * "Earlier" at its left end, "Later" at its right, an ellipsis between;
 * any of them shows the whole road, and "Only what's near" at its right
 * end folds it back. Pressing a stop shows its arc on the map, as the
 * map's list of arcs does. Left and Right walk the stops, Down enters the
 * open arc's topics and Up leaves them; Right on a topic steps onto its
 * card on the map. The row's height is the course's longest arc's, so the
 * map above never moves.
 */
export function RoadTrack(c: CourseColumns) {
	const { view, shown, showArc, marked, onPoint, listRef, onEnterMap, onExitTop } = c;
	const arcs = view.arcs!;
	const { course, facts } = view;
	const runup = useCourseRunup(course.map.workspace);
	const [whole, setWhole] = useState(false);
	const near = useMemo(() => roadWindow(arcs, whole), [arcs, whole]);
	const stop = useMemo(() => examStop(course.map, arcs), [course.map, arcs]);
	const folds = useMemo(() => roadWindow(arcs, false).length < arcs.length, [arcs]);
	const items = useMemo(() => trackItems(arcs, near, stop && facts.exam ? stop.stopBefore : undefined, folds), [arcs, near, stop, facts.exam, folds]);
	const tallest = Math.max(0, ...arcs.map((s) => s.topics.length));
	const stopsEl = useRef(new Map<string, HTMLElement>());
	const rowsEl = useRef(new Map<TopicHandle, HTMLElement>());
	const pending = useRef<TopicHandle | "first" | null>(null);
	const stops = items.flatMap((item) => (item.kind === "stop" ? [item.section.arc.handle] : item.kind === "fold" ? [`fold:${item.side}`] : []));
	const shownTopics = shown?.topics ?? [];

	const showAndFocus = (arc: ArcHandle, then: TopicHandle | "first" | null) => {
		if (!near.some((s) => s.arc.handle === arc)) setWhole(true);
		pending.current = then;
		showArc(arc);
	};

	useImperativeHandle(
		listRef,
		() => ({
			focus: (handle) => {
				const row = rowsEl.current.get(handle);
				if (row) return row.focus();
				const section = arcs.find((s) => s.topics.some((t) => t.topic.handle === handle));
				if (section) showAndFocus(section.arc.handle, handle);
			},
			focusFirst: () => stopsEl.current.get(shown?.arc.handle ?? stops[0] ?? "")?.focus(),
		}),
		[arcs, shown, stops, near, showArc],
	);

	useEffect(() => {
		const to = pending.current;
		if (!to) return;
		pending.current = null;
		(to === "first" ? rowsEl.current.get(shownTopics[0]?.topic.handle as TopicHandle) : rowsEl.current.get(to))?.focus();
	}, [shown, shownTopics]);

	const walkStops = (from: string, e: KeyboardEvent<HTMLElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		const at = stops.indexOf(from);
		const to = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? stops.length - 1 : null;
		if (to !== null) {
			e.preventDefault();
			stopsEl.current.get(stops[Math.max(0, Math.min(stops.length - 1, to))]!)?.focus();
		} else if (e.key === "ArrowDown" && !from.startsWith("fold:")) {
			e.preventDefault();
			if (shown?.arc.handle === from) rowsEl.current.get(shownTopics[0]?.topic.handle as TopicHandle)?.focus();
			else showAndFocus(from as ArcHandle, "first");
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			onExitTop();
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.currentTarget.blur();
		}
	};

	const walkRows = (row: CourseTopic, e: KeyboardEvent<HTMLAnchorElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		const at = shownTopics.findIndex((t) => t.topic.handle === row.topic.handle);
		if (e.key === "ArrowRight") {
			e.preventDefault();
			onEnterMap(row.topic.handle);
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const next = shownTopics[at + (e.key === "ArrowDown" ? 1 : -1)];
			if (next) rowsEl.current.get(next.topic.handle)?.focus();
			else if (e.key === "ArrowUp" && shown) stopsEl.current.get(shown.arc.handle)?.focus();
		} else if (e.key === " ") {
			e.preventDefault();
			e.currentTarget.click();
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.currentTarget.blur();
		}
	};

	const register = (key: string) => (el: HTMLElement | null) => {
		if (el) stopsEl.current.set(key, el);
		else stopsEl.current.delete(key);
	};

	const fold = (item: Extract<TrackItem, { kind: "fold" }>) => {
		const key = `fold:${item.side}`;
		const toggle = () => setWhole((w) => !w);
		const words = item.side === "near" ? FOLD_WORDS.near : item.side === "between" ? null : FOLD_WORDS[item.side];
		const press = (
			<Button
				ref={register(key)}
				variant="quiet"
				size="xs"
				data-slot="road-fold"
				data-side={item.side}
				aria-label={words ?? FOLD_WORDS.between}
				aria-expanded={whole}
				onClick={toggle}
				onKeyDown={(e) => walkStops(key, e)}
				className={cn(ON_TRACK, "-my-1 h-6 gap-1 px-1.5 text-callout font-normal text-muted-foreground hover:text-foreground")}
			>
				{item.side === "earlier" && <ChevronLeftIcon aria-hidden className="size-3.5" />}
				{item.side === "between" ? <EllipsisIcon aria-hidden className="size-3.5" /> : words}
				{(item.side === "later" || item.side === "near") && <ChevronRightIcon aria-hidden className={cn("size-3.5", item.side === "near" && "rotate-180")} />}
			</Button>
		);
		return (
			<li key={key} className={cn("flex shrink-0 flex-col pr-4", SEGMENT)}>
				{item.side === "between" ? (
					<Hint label={FOLD_WORDS.between} side="top">
						{press}
					</Hint>
				) : (
					press
				)}
			</li>
		);
	};

	return (
		<nav aria-label="Road" data-slot="road-track" className="flex min-w-0 flex-col" style={{ height: HEAD + tallest * ROW }}>
			<ol className="flex min-w-0 items-start">
				{items.map((item) => {
					if (item.kind === "fold") return fold(item);
					if (item.kind === "exam") {
						return (
							<li key="exam" data-slot="road-exam" className={cn("flex shrink-0 flex-col gap-2 pr-6", SEGMENT)}>
								<span className={cn(ON_TRACK, "w-4 justify-center text-foreground")}>
									<CalendarIcon aria-hidden className="size-4" />
								</span>
								<ExamFact course={course} runup={runup} words={facts.exam!} ready={null} className="text-body text-foreground [&>svg]:hidden" />
							</li>
						);
					}
					const { section } = item;
					const { arc } = section;
					const open = shown?.arc.handle === arc.handle;
					const past = stop?.past.has(arc.handle) ?? false;
					const checkable = arc.state === "ready";
					const fact = section.needsYou ? null : arc.state === "checked" ? ARC_STATE_WORDS.checked : arcStarts(section, course.map.today);
					return (
						<li
							key={arc.handle}
							data-slot="road-stop"
							data-arc={arc.handle}
							data-open={open || undefined}
							data-current={section.current || undefined}
							className={cn("flex min-w-0 flex-col gap-2 pr-6", SEGMENT, open ? "w-80 shrink-0" : "flex-1 basis-0")}
						>
							<span className={cn(ON_TRACK, "w-4 justify-center")}>{section.share === null ? null : <Ring aria-hidden share={section.share} />}</span>
							<button
								type="button"
								ref={register(arc.handle)}
								data-slot="road-stop-press"
								aria-current={open ? "true" : undefined}
								onClick={() => showArc(arc.handle)}
								onKeyDown={(e) => walkStops(arc.handle, e)}
								onMouseEnter={() => open && onPoint(leadOf(section))}
								onMouseLeave={() => onPoint(null)}
								className="-mx-1.5 flex min-w-0 flex-col items-start gap-0.5 rounded-md px-1.5 py-0.5 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								<span data-slot="road-stop-title" className={cn("line-clamp-2 min-w-0 text-body", past ? "text-muted-foreground" : "text-foreground")}>
									<MathText>{arc.title}</MathText>
									{section.current && <span aria-hidden="true" data-slot="road-stop-here" className="ml-1.5 inline-block size-1.5 rounded-full bg-ring align-middle" />}
								</span>
							</button>
							<span className="-mt-2 flex h-5 min-w-0 items-center text-callout">
								{section.needsYou ? (
									<span data-slot="road-stop-state" data-kind="needs-you" className="inline-flex items-center gap-1.5 text-warning">
										<CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
										{GROUP_WORDS["needs-you"]}
									</span>
								) : checkable ? (
									<Button variant="quiet" size="xs" data-slot="road-stop-check" disabled={c.checking === arc.handle} onClick={() => c.onCheck(section)} className="-mx-1.5 h-6 text-link hover:text-link">
										<ListChecksIcon aria-hidden />
										{CHECK_WORDS}
									</Button>
								) : (
									fact && (
										<span data-slot="road-stop-state" className="truncate text-muted-foreground">
											{fact}
										</span>
									)
								)}
							</span>
							{open && (
								<ul className="flex min-w-0 flex-col">
									{section.topics.map((row) => (
										<CourseTopicRow
											key={row.topic.handle}
											row={row}
											className="h-8"
											highlighted={marked === row.topic.handle}
											ref={(el) => {
												if (el) rowsEl.current.set(row.topic.handle, el);
												else rowsEl.current.delete(row.topic.handle);
											}}
											onMouseEnter={() => onPoint(row.topic.handle)}
											onMouseLeave={() => onPoint(null)}
											onFocus={() => onPoint(row.topic.handle)}
											onBlur={() => onPoint(null)}
											onKeyDown={(e) => walkRows(row, e)}
										/>
									))}
								</ul>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
