"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { CalendarIcon, CircleAlertIcon, ListChecksIcon } from "lucide-react";
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
import { arcStarts, examStop } from "@/components/course-page/candidates/road/road-model";
import { stripOffset, trackItems, type TrackItem } from "@/components/course-page/candidates/roadrows/track-model";
import { followTopic, type RoadFollow } from "@/components/course-page/candidates/roadrows/road-follow";
import { cn } from "@/lib/utils";

/** The clear space between the track and every marker on it, at every stop and at the exam. */
export const MARK_GAP = 6;
/** The track on an item: a hairline from the item's left edge to `MARK_GAP` short of its marker (a 16px box at
 *  its centre), and on from `MARK_GAP` past it to the item's right edge; items sit edge to edge, so their
 *  stretches meet and never touch a marker. */
const TRACK =
	"before:absolute before:top-[7.5px] before:left-0 before:h-px before:w-[calc(50%-14px)] before:bg-white/15 before:content-[''] after:absolute after:top-[7.5px] after:right-0 after:left-[calc(50%+14px)] after:h-px after:bg-white/15 after:content-['']";
/** An item's width: a folded arc as wide as its name needs on two lines, the selected arc as wide as its rows,
 *  the exam narrower. In px, so the strip's place is worked out from them, never measured mid-glide. */
const WIDTH = { stop: 224, open: 352, exam: 144 } as const;
/** The item's press: no fill, its words brightening under the pointer, the focus ring for keys. */
const PRESS = "group/press flex w-full flex-col items-center gap-2 rounded-lg px-2 pt-0 pb-1.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** How tall a stop is above its topics: its marker, its name on up to two lines and its fact. */
const HEAD = 16 + 8 + 40 + 20 + 12;
/** A topic row (the hybrid row's compact size) and Check it's line. */
const ROW = 48;
const CHECK = 32;
/** How long a wheel or swipe must rest before the strip settles onto the arc nearest where it stopped. */
const GESTURE_REST_MS = 140;
/** The strip's glide to the selected arc. */
const GLIDE = "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/** The window's sides fade only where the strip runs on beyond them. */
function edgeFade(left: boolean, right: boolean): React.CSSProperties {
	if (!left && !right) return {};
	return { maskImage: `linear-gradient(to right, ${left ? "transparent" : "#000"}, #000 64px, #000 calc(100% - 64px), ${right ? "transparent" : "#000"})` };
}

const keyOf = (item: TrackItem): string => (item.kind === "stop" ? item.section.arc.handle : "exam");

/**
 * Road in rows' road (spec: roadrows.md): every arc of the course on one
 * track under its map, left to right, the exam a stop where the plan
 * reaches it, in a window that never scrolls: the strip slides inside it
 * to centre the selected arc (held at its ends, so it never leaves the
 * window), its sides fading only where it runs on. The selected arc is
 * the one the page shows: open, its topics under it as Home's rows (the
 * hybrid row, compact). A wheel or swipe steps the selection one arc per
 * gesture with a smooth glide, as ← and → do; pressing a stop selects
 * it. Pointing at a topic row brings its card into view on the map, lit
 * with the rest dimmed, as Home's Today rows drive Home's map
 * (`onFollow`); pointing at a stop only brightens its words. Down enters
 * the selected arc's topics, Up leaves them for their stop and, from a
 * stop, for the head's press. The row is as tall as the course's longest
 * arc, so the map never moves.
 */
export function RoadTrack({ onFollow, ...c }: CourseColumns & { onFollow: (to: RoadFollow | null, by?: "pointer" | "focus") => void }) {
	const { view, shown, showArc, listRef, onExitTop } = c;
	const arcs = view.arcs!;
	const { course, facts } = view;
	const runup = useCourseRunup(course.map.workspace);
	const stop = useMemo(() => examStop(course.map, arcs), [course.map, arcs]);
	const items = useMemo(() => trackItems(arcs, stop && facts.exam ? stop.stopBefore : undefined), [arcs, stop, facts.exam]);
	const keys = items.map(keyOf);
	const tallest = Math.max(0, ...arcs.map((s) => s.topics.length + (s.arc.state === "ready" ? 1 : 0) * (CHECK / ROW)));
	const pressEl = useRef(new Map<string, HTMLElement>());
	const rowsEl = useRef(new Map<TopicHandle, HTMLElement>());
	const windowEl = useRef<HTMLDivElement>(null);
	const stripEl = useRef<HTMLDivElement>(null);
	const pending = useRef<TopicHandle | "first" | null>(null);
	const shownTopics = shown?.topics ?? [];
	const shownKey = shown?.arc.handle ?? "";
	const at = (key: string) => keys.indexOf(key);

	// The strip slides so the selected arc sits in the window's centre, held at the strip's ends. While a
	// wheel or swipe moves it, it follows the gesture instead (`live`, a position counted in arcs).
	const [win, setWin] = useState(0);
	const [ready, setReady] = useState(false);
	const [live, setLive] = useState<number | null>(null);
	const widths = items.map((i) => (i.kind === "exam" ? WIDTH.exam : i.section.arc.handle === shownKey ? WIDTH.open : WIDTH.stop));
	const strip = widths.reduce((sum, w) => sum + w, 0);
	const arcItem = arcs.map((s) => keys.indexOf(s.arc.handle));
	const selected = Math.max(0, arcs.findIndex((s) => s.arc.handle === shownKey));
	const offsetOf = (item: number) => {
		const start = widths.slice(0, Math.max(0, item)).reduce((sum, w) => sum + w, 0);
		return item >= 0 ? stripOffset({ start, width: widths[item]! }, strip, win) : 0;
	};
	const offset = (() => {
		if (live === null) return offsetOf(keys.indexOf(shownKey));
		const lo = Math.floor(live);
		const hi = Math.min(arcs.length - 1, lo + 1);
		const from = offsetOf(arcItem[lo]!);
		return from + (offsetOf(arcItem[hi]!) - from) * (live - lo);
	})();
	const max = strip - win;
	const fade = { left: offset > 0.5, right: max > 0.5 && offset < max - 0.5 };
	const aim = live === null ? null : (arcs[Math.round(live)]?.arc.handle ?? null);
	useLayoutEffect(() => {
		const el = windowEl.current;
		if (!el) return;
		setWin(el.clientWidth);
		setReady(true);
		const resized = new ResizeObserver(() => setWin(el.clientWidth));
		resized.observe(el);
		return () => resized.disconnect();
	}, []);

	/** Selects the arc `by` stops along from the selected one, the exam skipped. */
	const stepBy = useCallback(
		(by: 1 | -1) => {
			const order = arcs.map((s) => s.arc.handle);
			const from = Math.max(0, order.indexOf(shownKey as ArcHandle));
			const to = order[Math.max(0, Math.min(order.length - 1, from + by))];
			if (to && to !== shownKey) showArc(to);
		},
		[arcs, shownKey, showArc],
	);

	// A wheel or swipe moves the strip with it, an arc's width of travel for an arc, momentum included; when the
	// gesture rests the strip glides onto the arc nearest where it stopped, and that arc is selected. Listened to
	// directly, so the page never scrolls or swipes back.
	const gesture = useRef({ at: null as number | null, rest: undefined as ReturnType<typeof setTimeout> | undefined });
	const latest = useRef({ selected, count: arcs.length, order: arcs.map((s) => s.arc.handle), shownKey, showArc });
	latest.current = { selected, count: arcs.length, order: arcs.map((s) => s.arc.handle), shownKey, showArc };
	useEffect(() => {
		const el = windowEl.current;
		if (!el) return;
		const wheel = (e: globalThis.WheelEvent) => {
			const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
			if (delta === 0) return;
			e.preventDefault();
			const g = gesture.current;
			const now = latest.current;
			g.at = Math.max(0, Math.min(now.count - 1, (g.at ?? now.selected) + delta / WIDTH.stop));
			setLive(g.at);
			clearTimeout(g.rest);
			g.rest = setTimeout(() => {
				const to = latest.current.order[Math.round(g.at ?? latest.current.selected)];
				g.at = null;
				setLive(null);
				if (to && to !== latest.current.shownKey) latest.current.showArc(to);
			}, GESTURE_REST_MS);
		};
		const g = gesture.current;
		el.addEventListener("wheel", wheel, { passive: false });
		return () => {
			el.removeEventListener("wheel", wheel);
			clearTimeout(g.rest);
		};
	}, []);

	const showAndFocus = (arc: ArcHandle, then: TopicHandle | "first" | null) => {
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
		[arcs, shownKey, keys.join()],
	);

	useEffect(() => {
		const to = pending.current;
		if (!to) return;
		pending.current = null;
		(to === "first" ? rowsEl.current.get(shownTopics[0]?.topic.handle as TopicHandle) : rowsEl.current.get(to))?.focus({ preventScroll: true });
	}, [shown, shownTopics]);

	/** ← and → select the arc before or after and keep focus on its stop, Down enters its topics, Up leaves for the head. */
	const walkItems = (key: string, e: KeyboardEvent<HTMLElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
			e.preventDefault();
			const order = arcs.map((s) => s.arc.handle);
			const from = order.indexOf(key as ArcHandle);
			const to = order[Math.max(0, Math.min(order.length - 1, (from < 0 ? order.indexOf(shownKey as ArcHandle) : from) + (e.key === "ArrowRight" ? 1 : -1)))];
			if (to) {
				showArc(to);
				pressEl.current.get(to)?.focus({ preventScroll: true });
			}
		} else if (e.key === "ArrowDown" && key !== "exam") {
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
			stepBy(e.key === "ArrowRight" ? 1 : -1);
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

	const item = (entry: TrackItem, index: number): ReactNode => {
		const key = keyOf(entry);
		const ends = cn("relative shrink-0", TRACK, index === 0 && "before:hidden", index === items.length - 1 && "after:hidden");
		if (entry.kind === "exam") {
			return (
				<div key={key} data-road-item={key} data-slot="road-exam" className={cn(ends, "flex flex-col items-center gap-2")} style={{ width: WIDTH.exam }}>
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
			<div
				key={key}
				data-road-item={key}
				data-slot="road-stop"
				data-arc={arc.handle}
				data-open={open || undefined}
				data-current={section.current || undefined}
				className={cn(ends, "flex flex-col", ready && "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none")}
				style={{ width: open ? WIDTH.open : WIDTH.stop }}
			>
				<button
					type="button"
					ref={register(key)}
					onKeyDown={(e) => walkItems(key, e)}
					data-slot="road-stop-press"
					aria-current={open ? "true" : undefined}
					onClick={(e) => {
						blurAfterPointerClick(e);
						showArc(arc.handle);
					}}
					className={PRESS}
				>
					<span className="flex size-4 items-center justify-center">{section.share === null ? null : <Ring aria-hidden share={section.share} />}</span>
					<span
						data-slot="road-stop-title"
						className={cn(
							"min-w-0 text-body text-balance transition-colors duration-150 motion-reduce:transition-none",
							open || aim === arc.handle ? "text-foreground" : past ? "text-muted-foreground/70 group-hover/press:text-muted-foreground" : "text-muted-foreground group-hover/press:text-foreground",
						)}
					>
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
			<div ref={windowEl} data-slot="road-window" className="min-w-0 overflow-hidden" style={edgeFade(fade.left, fade.right)}>
				<div ref={stripEl} data-slot="road-strip" className={cn("flex w-max", ready && live === null && GLIDE)} style={{ transform: `translateX(${-offset}px)` }}>
					{items.map(item)}
				</div>
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
