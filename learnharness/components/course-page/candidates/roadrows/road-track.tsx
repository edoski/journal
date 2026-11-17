"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { CalendarIcon, ListChecksIcon } from "lucide-react";
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
import { trackItems, type TrackItem } from "@/components/course-page/candidates/roadrows/track-model";
import { followTopic, type RoadFollow } from "@/components/course-page/candidates/roadrows/road-follow";
import { cn } from "@/lib/utils";

/** A topic row (the hybrid row's compact size), Check it's line, and the cards' row with its gap below. */
const ROW = 48;
const CHECK = 32;
const CARDS = 76 + 16;
/** The selected arc's topics sit in this many columns under the cards. */
const COLUMNS = 3;
/** An arc's card, as the map's cards are drawn (`base-node.tsx`): a hairline border on the card surface. */
const CARD =
	"group/card flex min-w-[9.5rem] flex-1 basis-0 snap-start flex-col overflow-hidden rounded-lg border bg-card text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

/** The selected card wears the map's "You are here" ring (canvas-node.tsx), set inline because the app's
 *  unlayered border colour (globals.css, `*`) outranks a border utility. */
const SELECTED: React.CSSProperties = { borderColor: "var(--ring)", boxShadow: "0 0 0 3px color-mix(in oklab, var(--ring) 16%, transparent)" };

const keyOf = (item: TrackItem): string => (item.kind === "stop" ? item.section.arc.handle : "exam");

/**
 * Road in rows' road (spec: roadrows.md): every arc of the course as a
 * card in one row under its map, left to right in study order, the exam
 * a card where the plan reaches it. A card is drawn as the map's cards
 * are: its one fact on top ("Needs you", "Ready for its check", "Starts
 * 20 Nov"), then its ring and name. All the cards fit side by side; a
 * course with more arcs than fit scrolls natively, snapping to a card's
 * edge. Pressing a card selects its arc: the map shows it and its topics
 * fill the panel under the cards, as Home's Today rows in columns.
 * Pointing at a topic row brings its card into view on the map, lit with
 * the rest dimmed, as Home does (`onFollow`). ← and → select the arc
 * before or after, Down enters its topics, Up leaves them for its card
 * and, from a card, for the head's press. The panel keeps the height of
 * the course's longest arc, so the map never moves.
 */
export function RoadTrack({ onFollow, ...c }: CourseColumns & { onFollow: (to: RoadFollow | null, by?: "pointer" | "focus") => void }) {
	const { view, shown, showArc, listRef, onExitTop } = c;
	const arcs = view.arcs!;
	const { course, facts } = view;
	const runup = useCourseRunup(course.map.workspace);
	const stop = useMemo(() => examStop(course.map, arcs), [course.map, arcs]);
	const items = useMemo(() => trackItems(arcs, stop && facts.exam ? stop.stopBefore : undefined), [arcs, stop, facts.exam]);
	const tallest = Math.max(0, ...arcs.map((s) => Math.ceil(s.topics.length / COLUMNS) + (s.arc.state === "ready" ? CHECK / ROW : 0)));
	const cardsEl = useRef(new Map<string, HTMLElement>());
	const rowsEl = useRef(new Map<TopicHandle, HTMLElement>());
	const pending = useRef<TopicHandle | "first" | null>(null);
	const shownTopics = shown?.topics ?? [];
	const shownKey = shown?.arc.handle ?? "";
	const order = arcs.map((s) => s.arc.handle);

	// The selected card stays in view when the row scrolls (a course with more arcs than fit).
	useEffect(() => {
		cardsEl.current.get(shownKey)?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
	}, [shownKey]);

	/** Selects the arc `by` cards along from the selected one, keeping focus on its card. */
	const stepBy = (by: 1 | -1, focus: boolean) => {
		const from = Math.max(0, order.indexOf(shownKey as ArcHandle));
		const to = order[Math.max(0, Math.min(order.length - 1, from + by))];
		if (!to) return;
		if (to !== shownKey) showArc(to);
		if (focus) cardsEl.current.get(to)?.focus({ preventScroll: true });
	};

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
			focusFirst: () => cardsEl.current.get(shownKey || order[0] || "")?.focus({ preventScroll: true }),
		}),
		[arcs, shownKey, order.join()],
	);

	useEffect(() => {
		const to = pending.current;
		if (!to) return;
		pending.current = null;
		(to === "first" ? rowsEl.current.get(shownTopics[0]?.topic.handle as TopicHandle) : rowsEl.current.get(to))?.focus({ preventScroll: true });
	}, [shown, shownTopics]);

	const walkCards = (key: string, e: KeyboardEvent<HTMLElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
			e.preventDefault();
			if (key !== shownKey) showArc(key as ArcHandle);
			stepBy(e.key === "ArrowRight" ? 1 : -1, true);
		} else if (e.key === "ArrowDown") {
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
			stepBy(e.key === "ArrowRight" ? 1 : -1, true);
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const next = shownTopics[index + (e.key === "ArrowDown" ? 1 : -1)];
			if (next) rowsEl.current.get(next.topic.handle)?.focus({ preventScroll: true });
			else if (e.key === "ArrowUp") cardsEl.current.get(shownKey)?.focus({ preventScroll: true });
		} else if (e.key === " ") {
			e.preventDefault();
			e.currentTarget.click();
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.currentTarget.blur();
		}
	};

	const register = (key: string) => (el: HTMLElement | null) => {
		if (el) cardsEl.current.set(key, el);
		else cardsEl.current.delete(key);
	};

	const card = (entry: TrackItem): ReactNode => {
		const key = keyOf(entry);
		if (entry.kind === "exam") {
			return (
				<div key={key} data-road-item={key} data-slot="road-exam" className="flex w-[6.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-dashed bg-transparent">
					<span className="flex h-7 items-center gap-1.5 border-b border-dashed px-2.5 text-callout text-muted-foreground">
						<CalendarIcon aria-hidden className="size-3.5 shrink-0" />
					</span>
					<ExamFact course={course} runup={runup} words={facts.exam!} ready={null} className="h-12 items-start px-2.5 pt-2 text-body text-foreground [&>svg]:hidden" />
				</div>
			);
		}
		const { section } = entry;
		const { arc } = section;
		const open = shownKey === arc.handle;
		const past = stop?.past.has(arc.handle) ?? false;
		const checkable = arc.state === "ready";
		const starts = arcStarts(section, course.map.today);
		const fact = section.needsYou ? (
			<span data-slot="road-stop-state" data-kind="needs-you" className="text-warning">
				{GROUP_WORDS["needs-you"]}
			</span>
		) : checkable ? (
			<span data-slot="road-stop-state" data-kind="ready">
				{ARC_STATE_WORDS.ready}
			</span>
		) : arc.state === "checked" ? (
			<span data-slot="road-stop-state">{ARC_STATE_WORDS.checked}</span>
		) : starts ? (
			<span data-slot="road-stop-state">{starts}</span>
		) : section.current ? (
			<span data-slot="road-stop-state" className="text-ring">
				You are here
			</span>
		) : null;
		return (
			<button
				key={key}
				type="button"
				ref={register(key)}
				data-road-item={key}
				data-slot="road-stop"
				data-arc={arc.handle}
				data-open={open || undefined}
				data-current={section.current || undefined}
				aria-pressed={open}
				onKeyDown={(e) => walkCards(key, e)}
				onClick={(e) => {
					blurAfterPointerClick(e);
					showArc(arc.handle);
				}}
				className={cn(CARD, !open && "hover:border-white/20", past && !open && "opacity-60")}
				style={open ? SELECTED : undefined}
			>
				<span className={cn("flex h-7 min-w-0 items-center gap-1.5 border-b border-white/6 px-2.5 text-callout whitespace-nowrap text-muted-foreground")}>
					<span className="flex size-3.5 shrink-0 items-center justify-center">{section.share === null ? null : <Ring aria-hidden share={section.share} />}</span>
					<span className="min-w-0 truncate">{fact}</span>
				</span>
				<span
					data-slot="road-stop-title"
					className={cn(
						"line-clamp-2 h-12 min-w-0 px-2.5 pt-2 text-body transition-colors duration-150 motion-reduce:transition-none",
						open ? "text-foreground" : "text-muted-foreground group-hover/card:text-foreground",
					)}
				>
					<MathText>{arc.title}</MathText>
				</span>
			</button>
		);
	};

	const open = shown;
	return (
		<nav aria-label="Road" data-slot="road-track" className="flex min-w-0 shrink-0 flex-col gap-4 pt-4" style={{ height: 16 + CARDS + tallest * ROW }}>
			<div data-slot="road-window" className="flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain">
				{items.map(card)}
			</div>
			{open && (
				<div data-slot="road-topics" className="flex min-w-0 flex-col">
					{open.arc.state === "ready" && (
						<div className="flex h-8 items-center">
							<Button variant="quiet" size="xs" data-slot="road-stop-check" disabled={c.checking === open.arc.handle} onClick={() => c.onCheck(open)} className="-mx-1.5 h-7 text-link hover:text-link">
								<ListChecksIcon aria-hidden />
								{CHECK_WORDS}
							</Button>
						</div>
					)}
					<ul className="grid min-w-0 gap-x-8" style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}>
						{open.topics.map((row) => (
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
				</div>
			)}
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
