"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type WheelEvent } from "react";
import Link from "next/link";
import { CalendarIcon, ChevronsLeftIcon, ChevronsRightIcon, CircleAlertIcon, EllipsisIcon, ListChecksIcon, ShrinkIcon } from "lucide-react";
import type { ArcHandle, TopicHandle } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Ring } from "@/components/ui/pie";
import { MathText } from "@/components/ui/math-text";
import { MathLine } from "@/components/ui/math-line";
import { ARC_STATE_WORDS } from "@/components/study-words";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { HYBRID_HAIRLINE, hybridRow } from "@/components/study-home/agenda-rows/hybrid/hybrid-rows";
import { GROUP_WORDS, type CourseArcSection, type CourseTopic } from "@/components/course-page/course-model";
import { CHECK_WORDS } from "@/components/course-page/course-arc";
import { RowFact } from "@/components/course-page/course-topic-row";
import { ExamFact } from "@/components/course-page/course-head/head-parts";
import { useCourseRunup } from "@/components/course-page/course-head/use-course-runup";
import type { CourseColumns } from "@/components/course-page/split/split-course";
import { arcStarts, examStop, roadWindow } from "@/components/course-page/candidates/road/road-model";
import { trackItems, type TrackItem } from "@/components/course-page/candidates/roadrows/track-model";
import { followTopic, type RoadFollow } from "@/components/course-page/candidates/roadrows/road-follow";
import { cn } from "@/lib/utils";

/** The words the road's ends say. */
export const FOLD_WORDS = { earlier: "Earlier", later: "Later", between: "More", near: "Only what's near" } as const;

/** The clear space between the track and every marker on it, at every stop and at the exam. */
export const MARK_GAP = 6;
/** The track on an item: a hairline from the item's left edge to `MARK_GAP` short of its marker (a 16px box at
 *  its centre), and on from `MARK_GAP` past it to the item's right edge; items sit edge to edge, so their
 *  stretches meet and never touch a marker. */
const TRACK =
	"before:absolute before:top-[7.5px] before:left-0 before:h-px before:w-[calc(50%-14px)] before:bg-white/15 before:content-[''] after:absolute after:top-[7.5px] after:right-0 after:left-[calc(50%+14px)] after:h-px after:bg-white/15 after:content-['']";
/** An arc's slot: a folded arc as wide as its name needs on two lines, the open arc as wide as its rows. */
const SLOT = "w-[14rem]";
const OPEN = "w-[22rem]";
const END = "w-[9rem]";
/** The item's press: no fill, its words brightening under the pointer, the focus ring for keys. */
const PRESS = "group/press flex w-full flex-col items-center gap-2 rounded-lg px-2 pt-0 pb-1.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** How tall a stop is above its topics: its marker, its name on up to two lines and its fact. */
const HEAD = 16 + 8 + 40 + 20 + 12;
/** A topic row (the hybrid row's compact size) and Check it's line. */
const ROW = 48;
const CHECK = 32;
/** The road's sides fade into the page, as the map's do. */
const EDGE_FADE: React.CSSProperties = { maskImage: "linear-gradient(to right, transparent, #000 64px, #000 calc(100% - 64px), transparent)" };

function reducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const keyOf = (item: TrackItem): string => (item.kind === "stop" ? item.section.arc.handle : item.kind === "fold" ? `fold:${item.side}` : "exam");

/**
 * Road in rows' road (spec: roadrows.md): the course's road as a carousel
 * under its map, scrolling natively sideways (a swipe, or the wheel), one item per arc
 * shown (its ring on the track, its whole name, its one fact), the exam an
 * item where the plan reaches it, and the arcs folded away the carousel's
 * ends ("Earlier", "Later", "More" between), any of which shows the whole
 * road; "Only what's near" ends the whole road. The track runs through the
 * items and stops `MARK_GAP` short of every marker. The arc the page shows
 * is open, its topics hanging under it as Home's rows (the hybrid row,
 * compact); it is centred on arrival, and focusing an item glides it to
 * the centre with a gentle snap (at once under reduced motion); the items
 * beyond fade at the row's edges. Pointing at or focusing a stop shows its
 * arc on the map with its cards lit, a topic row brings its card into view
 * lit with the rest dimmed, as Home's Today rows drive Home's map
 * (`onFollow`); pressing a stop opens its arc. ← and → step one item, Down
 * enters the open arc's topics, Up leaves them for their stop and, from a
 * stop, for the head's press. The row is as tall as the course's longest
 * arc, so the map never moves.
 */
export function RoadTrack({ onFollow, ...c }: CourseColumns & { onFollow: (to: RoadFollow | null, by?: "pointer" | "focus") => void }) {
	const { view, shown, showArc, listRef, onExitTop } = c;
	const arcs = view.arcs!;
	const { course, facts } = view;
	const runup = useCourseRunup(course.map.workspace);
	const [whole, setWhole] = useState(false);
	const scroller = useRef<HTMLDivElement>(null);
	const near = useMemo(() => roadWindow(arcs, whole), [arcs, whole]);
	const stop = useMemo(() => examStop(course.map, arcs), [course.map, arcs]);
	const folds = useMemo(() => roadWindow(arcs, false).length < arcs.length, [arcs]);
	const items = useMemo(() => trackItems(arcs, near, stop && facts.exam ? stop.stopBefore : undefined, folds), [arcs, near, stop, facts.exam, folds]);
	const keys = items.map(keyOf);
	const tallest = Math.max(0, ...arcs.map((s) => s.topics.length + (s.arc.state === "ready" ? 1 : 0) * (CHECK / ROW)));
	const pressEl = useRef(new Map<string, HTMLElement>());
	const rowsEl = useRef(new Map<TopicHandle, HTMLElement>());
	const pending = useRef<TopicHandle | "first" | null>(null);
	const shownTopics = shown?.topics ?? [];
	const at = (key: string) => keys.indexOf(key);
	/** Brings an item to the road's centre, gliding unless asked not to or the system asks for less motion. */
	const centre = useCallback((key: string, instant = false) => {
		const el = scroller.current?.querySelector<HTMLElement>(`[data-road-item="${CSS.escape(key)}"]`);
		el?.scrollIntoView({ inline: "center", block: "nearest", behavior: instant || reducedMotion() ? "instant" : "smooth" });
	}, []);
	const glide = useCallback((index: number) => centre(keys[index] ?? ""), [centre, keys.join()]);

	// The arc the page shows comes to the centre: at once on arrival, gliding whenever the map's list shows another.
	const shownKey = shown?.arc.handle ?? "";
	const arrived = useRef(false);
	useLayoutEffect(() => {
		centre(shownKey, !arrived.current);
		arrived.current = true;
	}, [shownKey, whole]);

	/** A wheel turned up or down moves the road sideways; a trackpad's sideways swipe scrolls it natively. */
	const wheel = (e: WheelEvent<HTMLDivElement>) => {
		if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
	};

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
			focusFirst: () => pressEl.current.get(shownKey || keys[0] || "")?.focus({ preventScroll: true }),
		}),
		[arcs, shownKey, keys.join(), near],
	);

	useEffect(() => {
		const to = pending.current;
		if (!to) return;
		pending.current = null;
		(to === "first" ? rowsEl.current.get(shownTopics[0]?.topic.handle as TopicHandle) : rowsEl.current.get(to))?.focus({ preventScroll: true });
	}, [shown, shownTopics]);

	const focusItem = (index: number) => {
		const key = keys[Math.max(0, Math.min(keys.length - 1, index))];
		if (key) pressEl.current.get(key)?.focus({ preventScroll: true });
	};

	/** ← and → step one item (the carousel glides with them), Down enters the open arc's topics, Up leaves for the head. */
	const walkItems = (key: string, e: KeyboardEvent<HTMLElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		const index = at(key);
		const to = e.key === "ArrowRight" ? index + 1 : e.key === "ArrowLeft" ? index - 1 : e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : null;
		if (to !== null) {
			e.preventDefault();
			focusItem(to);
		} else if (e.key === "ArrowDown" && !key.startsWith("fold:") && key !== "exam") {
			e.preventDefault();
			if (shownKey === key) rowsEl.current.get(shownTopics[0]?.topic.handle as TopicHandle)?.focus({ preventScroll: true });
			else showAndFocus(key as ArcHandle, "first");
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
		const index = shownTopics.findIndex((t) => t.topic.handle === row.topic.handle);
		if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			e.preventDefault();
			focusItem(at(shownKey) + (e.key === "ArrowRight" ? 1 : -1));
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const next = shownTopics[index + (e.key === "ArrowDown" ? 1 : -1)];
			if (next) rowsEl.current.get(next.topic.handle)?.focus({ preventScroll: true });
			else if (e.key === "ArrowUp") pressEl.current.get(shownKey)?.focus({ preventScroll: true });
		} else if (e.key === " ") {
			e.preventDefault();
			e.currentTarget.click();
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.currentTarget.blur();
		}
	};

	const register = (key: string) => (el: HTMLElement | null) => {
		if (el) pressEl.current.set(key, el);
		else pressEl.current.delete(key);
	};

	/** What every item's press shares: it registers for the walk, glides to the centre when focused, and walks. */
	const pressProps = (key: string, index: number) => ({
		ref: register(key),
		onFocus: () => glide(index),
		onKeyDown: (e: KeyboardEvent<HTMLElement>) => walkItems(key, e),
	});

	const item = (entry: TrackItem, index: number): ReactNode => {
		const key = keyOf(entry);
		const ends = cn("relative", TRACK, index === 0 && "before:hidden", index === items.length - 1 && "after:hidden");
		if (entry.kind === "fold") {
			const Icon = entry.side === "earlier" ? ChevronsLeftIcon : entry.side === "later" ? ChevronsRightIcon : entry.side === "near" ? ShrinkIcon : EllipsisIcon;
			return (
				<div key={key} data-road-item={key} data-slot="road-fold" data-side={entry.side} className={cn("shrink-0", END, ends)}>
					<button type="button" {...pressProps(key, index)} aria-expanded={whole} onClick={() => setWhole((w) => !w)} className={cn(PRESS, "text-callout text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none")}>
						<span className="flex size-4 items-center justify-center">
							<Icon aria-hidden className="size-4" />
						</span>
						{FOLD_WORDS[entry.side]}
					</button>
				</div>
			);
		}
		if (entry.kind === "exam") {
			return (
				<div key={key} data-road-item={key} data-slot="road-exam" className={cn("shrink-0", END, ends, "flex flex-col items-center gap-2")}>
					<span className="flex size-4 items-center justify-center text-foreground">
						<CalendarIcon aria-hidden className="size-4" />
					</span>
					<ExamFact course={course} runup={runup} words={facts.exam!} ready={null} className="text-body text-foreground [&>svg]:hidden" />
				</div>
			);
		}
		const { section } = entry;
		const { arc } = section;
		const open = shownKey === arc.handle;
		const past = stop?.past.has(arc.handle) ?? false;
		const checkable = arc.state === "ready";
		const fact = section.needsYou ? null : arc.state === "checked" ? ARC_STATE_WORDS.checked : arcStarts(section, course.map.today);
		return (
			<div key={key} data-road-item={key} data-slot="road-stop" data-arc={arc.handle} data-open={open || undefined} data-current={section.current || undefined} className={cn("shrink-0 transition-[width] duration-200 motion-reduce:transition-none", open ? OPEN : SLOT, ends, "flex flex-col")}>
				<button
					type="button"
					{...pressProps(key, index)}
					data-slot="road-stop-press"
					aria-current={open ? "true" : undefined}
					onClick={(e) => {
						blurAfterPointerClick(e);
						showArc(arc.handle);
					}}
					className={PRESS}
				>
					<span className="flex size-4 items-center justify-center">{section.share === null ? null : <Ring aria-hidden share={section.share} />}</span>
					<span data-slot="road-stop-title" className={cn("min-w-0 text-body text-balance transition-colors duration-150 motion-reduce:transition-none", open ? "text-foreground" : past ? "text-muted-foreground/70 group-hover/press:text-muted-foreground" : "text-muted-foreground group-hover/press:text-foreground")}>
						<MathText>{arc.title}</MathText>
						{section.current && <span aria-hidden="true" data-slot="road-stop-here" className="ml-1.5 inline-block size-1.5 rounded-full bg-ring align-middle" />}
					</span>
					<span className="flex h-5 items-center text-callout">
						{section.needsYou ? (
							<span data-slot="road-stop-state" data-kind="needs-you" className="inline-flex items-center gap-1.5 text-warning">
								<CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
								{GROUP_WORDS["needs-you"]}
							</span>
						) : checkable ? (
							<span data-slot="road-stop-state" data-kind="ready" className="inline-flex items-center gap-1.5 text-muted-foreground">
								<ListChecksIcon aria-hidden className="size-3.5 shrink-0" />
								{ARC_STATE_WORDS.ready}
							</span>
						) : (
							fact && (
								<span data-slot="road-stop-state" className="text-muted-foreground">
									{fact}
								</span>
							)
						)}
					</span>
				</button>
				{open && (
					<ul className="mt-2 flex min-w-0 flex-col px-3">
						{checkable && (
							<li className="flex h-8 list-none items-center">
								<Button variant="quiet" size="xs" data-slot="road-stop-check" disabled={c.checking === arc.handle} onClick={() => c.onCheck(section)} className="-mx-1.5 h-7 text-link hover:text-link">
									<ListChecksIcon aria-hidden />
									{CHECK_WORDS}
								</Button>
							</li>
						)}
						{section.topics.map((row) => (
							<RoadTopicRow
								key={row.topic.handle}
								row={row}
								pointed={c.marked === row.topic.handle}
								rowRef={(el) => {
									if (el) rowsEl.current.set(row.topic.handle, el);
									else rowsEl.current.delete(row.topic.handle);
								}}
								onPoint={(by) => onFollow(followTopic(course, row.topic.handle), by)}
								onPointEnd={() => onFollow(null)}
								onKeyDown={(e) => walkRows(row, e)}
							/>
						))}
					</ul>
				)}
			</div>
		);
	};

	return (
		<nav aria-label="Road" data-slot="road-track" className="flex min-w-0 shrink-0 flex-col pt-4" style={{ height: 16 + HEAD + tallest * ROW }}>
			<div ref={scroller} data-slot="road-scroller" onWheel={wheel} className="flex min-w-0 overflow-x-auto overscroll-x-contain px-[50%]" style={EDGE_FADE}>
				{items.map(item)}
			</div>
		</nav>
	);
}

/** One topic under its open arc: Home's Today row at its compact size (the hybrid row), the map's pie beside two
 *  lines, where he stands, then the topic with its one fact flush right, which opens its page. */
function RoadTopicRow({
	row,
	pointed,
	rowRef,
	onPoint,
	onPointEnd,
	onKeyDown,
}: {
	row: CourseTopic;
	pointed: boolean;
	rowRef: (el: HTMLAnchorElement | null) => void;
	onPoint: (by: "pointer" | "focus") => void;
	onPointEnd: () => void;
	onKeyDown: (e: KeyboardEvent<HTMLAnchorElement>) => void;
}) {
	return (
		<li data-slot="course-topic" className={cn("list-none", HYBRID_HAIRLINE)}>
			<Link
				ref={rowRef}
				href={row.href}
				onClick={blurAfterPointerClick}
				data-slot="course-topic-row"
				data-topic={row.topic.handle}
				data-pointed={pointed || undefined}
				aria-current={row.current ? "location" : undefined}
				onMouseEnter={() => onPoint("pointer")}
				onMouseLeave={onPointEnd}
				onFocus={() => onPoint("focus")}
				onBlur={onPointEnd}
				onKeyDown={onKeyDown}
				className={cn(hybridRow({ size: "compact" }), "outline-none transition-colors duration-150 hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none")}
			>
				<span className="row-span-2 flex self-center">
					<TopicGlyph standing={row.standing} />
				</span>
				<span className="col-span-2 truncate text-callout text-muted-foreground">{row.standing.words}</span>
				<MathLine className="text-headline text-foreground">{row.topic.title}</MathLine>
				{row.fact ? <RowFact fact={row.fact} words={row.factWords ?? row.fact.words} /> : <span />}
			</Link>
		</li>
	);
}
