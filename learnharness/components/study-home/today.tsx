"use client";

import { useMemo } from "react";
import Link from "next/link";
import { courseLabel, type StudyCourse, type TopicHandle } from "@/src/core";
import { layoutCourseMap } from "@/components/course-map/course-map-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	longDay,
	pathPlace,
	placeWords,
	runupExam,
	stepDetail,
	stepWords,
	type PathPlace,
	type TodayRow,
} from "@/components/study-home/study-facts";

/** At most this many lines; past it the last line names the other courses. */
const MAX_LINES = 5;

/** Every column of a line, the same on every line, so the course, the
 *  lesson, its place and the action read down the list. */
const LINE =
	"-mx-3 grid h-13 w-[calc(100%+1.5rem)] grid-cols-[9rem_minmax(0,1fr)_9rem_5.5rem] items-center justify-items-start gap-x-6 rounded-lg px-3 text-left font-normal whitespace-normal";

/**
 * Today (spec: today.md): one line per course, each its one next lesson,
 * which course it belongs to and where it sits on that course's map. The
 * first line holds the page's only primary action.
 */
export function Today({
	rows,
	today,
	busy,
	onContinue,
}: {
	rows: readonly TodayRow[];
	/** The engine's study day. */
	today: string;
	busy: boolean;
	onContinue: (workspace: string) => void;
}) {
	const shown = rows.length > MAX_LINES ? rows.slice(0, MAX_LINES - 1) : rows;
	const also = rows.slice(shown.length);
	return (
		<section aria-labelledby="today-heading" data-slot="today" className="flex shrink-0 flex-col gap-1">
			<h2 id="today-heading" className="flex items-baseline gap-2 text-label">
				<span className="font-semibold text-foreground">Today</span>
				<span className="text-muted-foreground">{longDay(today)}</span>
			</h2>
			<ul className="flex flex-col">
				{shown.map((row, i) => (
					<li key={row.kind === "session" ? row.chat.id : row.course.map.workspace}>
						<TodayLine row={row} primary={i === 0} busy={busy} onContinue={onContinue} />
					</li>
				))}
				{also.length > 0 && (
					<li data-slot="today-also" className="flex h-13 items-center gap-1 text-row text-muted-foreground">
						Also today:
						{also.map((row) =>
							row.kind === "session" ? (
								<Button key={row.chat.id} variant="quiet" size="sm" asChild className="text-row font-normal text-foreground">
									<Link href={`/chat/${row.chat.id}`}>{row.course ? row.course.map.title : row.chat.title}</Link>
								</Button>
							) : (
								<Button
									key={row.course.map.workspace}
									variant="quiet"
									size="sm"
									disabled={busy}
									onClick={() => onContinue(row.course.map.workspace)}
									className="text-row font-normal text-foreground"
								>
									{row.course.map.title}
								</Button>
							),
						)}
					</li>
				)}
			</ul>
		</section>
	);
}

/** One line: the course (with its exam in the run-up), the lesson in words
 *  (with what follows), its place on the map, and on the first line the
 *  action. The whole line opens the lesson. */
function TodayLine({ row, primary, busy, onContinue }: { row: TodayRow; primary: boolean; busy: boolean; onContinue: (workspace: string) => void }) {
	const course = row.course;
	const cells = (
		<>
			<span className="flex min-w-0 flex-col">
				<span className="w-full truncate text-row text-foreground">{course ? course.map.title : row.kind === "session" && row.chat.course ? courseLabel(row.chat.course) : "No course"}</span>
				{course && runupExam(course) && <span className="truncate text-label text-muted-foreground">{runupExam(course)}</span>}
			</span>
			<span className="flex w-full min-w-0 flex-col">
				<span className="truncate text-row font-medium text-foreground">{row.kind === "session" ? row.chat.title : stepWords(row.step)}</span>
				{row.kind === "course" && stepDetail(row.step) && <span className="truncate text-label text-muted-foreground">{stepDetail(row.step)}</span>}
			</span>
			{row.kind === "session" ? (
				<span className="text-label font-semibold text-link">Your turn</span>
			) : (
				<Place course={row.course} topics={row.step.kind === "none" ? [] : row.step.topics} />
			)}
			<span className="justify-self-end">
				{primary && (
					<span aria-hidden="true" className={cn(buttonVariants({ size: "sm" }), "font-normal")}>
						{row.kind === "session" ? "Open" : "Continue"}
					</span>
				)}
			</span>
		</>
	);
	if (row.kind === "session") {
		return (
			<Button variant="quiet" asChild data-slot="today-line" data-primary={primary || undefined} className={LINE}>
				<Link href={`/chat/${row.chat.id}`} aria-disabled={busy || undefined}>
					{cells}
				</Link>
			</Button>
		);
	}
	return (
		<Button
			variant="quiet"
			data-slot="today-line"
			data-primary={primary || undefined}
			disabled={busy}
			onClick={() => onContinue(row.course.map.workspace)}
			className={LINE}
		>
			{cells}
		</Button>
	);
}

/** Where the lesson sits on the course's map: one mark per step of the map,
 *  the lesson's steps in ink, and the same in words. */
function Place({ course, topics }: { course: StudyCourse; topics: readonly TopicHandle[] }) {
	const { map } = course;
	const layers = useMemo(() => layoutCourseMap(map.topics, map.edges).layers, [map]);
	const place = pathPlace(topics, layers);
	if (!place) return <span />;
	return (
		<span data-slot="today-place" className="flex items-center gap-2">
			<StepMarks place={place} />
			<span className="text-label text-muted-foreground tabular-nums">{placeWords(place)}</span>
		</span>
	);
}

function StepMarks({ place }: { place: PathPlace }) {
	return (
		<span aria-hidden="true" className="flex items-center gap-0.5">
			{Array.from({ length: place.of }, (_, i) => (
				<span key={i} className={cn("h-3 w-1 rounded-full", i + 1 >= place.from && i + 1 <= place.to ? "bg-foreground" : "bg-foreground/15")} />
			))}
		</span>
	);
}
