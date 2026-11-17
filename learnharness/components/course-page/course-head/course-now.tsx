"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MathLine } from "@/components/ui/math-line";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { standingOf } from "@/components/course-map/topic-map/topic-standing";
import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { CourseBadge } from "@/components/study-home/agenda-rows/course-badge";
import { lessonOf } from "@/components/study-home/lesson-facts";
import { PagePress } from "@/components/page-frame/page-frame";
import { reasonMark } from "@/components/unit-inbox/fact-icon";
import { StatusMark } from "@/components/unit-inbox/status-mark";
import type { CourseColumns } from "@/components/course-page/split/split-course";

const NOW_ROW = "group/press -mx-3 flex h-14 w-[calc(100%+1.5rem)] items-center gap-4 rounded-lg px-3 text-left font-normal whitespace-normal";

/**
 * Now (spec: course-head.md), across the page under the head: the step the
 * course's press takes up, as Today's row says it (its title, its reason's
 * icon and words, the press's word flush right beside them), which does
 * what Today's line does. The row is the course's action (`course-action`),
 * which the road's arrow walk reaches from its first stop. A hairline
 * closes it off from the road.
 */
export function CourseNow({ view, busy, onContinue }: CourseColumns) {
	const { course, pickUp: line, next } = view;
	const lead = line ? (line.lead ?? line.topics[0] ?? null) : null;
	const glyph = lead ? <TopicGlyph standing={standingOf(lead)} /> : <CourseBadge course={course} />;
	const word = line ? lessonOf(line.row).action : next.lesson.action;
	// The title on the first line, the reason under it; the page's press sits centred at the row's end.
	const lines = (title: string, why: typeof next.why) => (
		<>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<MathLine className="min-w-0 text-headline text-foreground">{title}</MathLine>
				<span className="flex min-w-0 overflow-hidden">
					{/* A new topic's reason only while it fits on one line; cut, its plain words, since the topic page says the whole reason. */}
					{why && <StatusMark data-slot="today-why" {...reasonMark(why)} short={why.starts ? reasonMark(why, why.short) : undefined} className="max-w-full" />}
				</span>
			</span>
			<PagePress word={word} />
		</>
	);
	return (
		<div data-slot="course-now" className="mb-3 flex shrink-0 flex-col border-b border-border/50 pb-5">
			{line ? (
				<LineTarget row={line.row} busy={busy} onContinue={onContinue} data-slot="course-action" className={NOW_ROW}>
					<span className="flex shrink-0">{glyph}</span>
					{lines(line.title, line.why)}
				</LineTarget>
			) : next.lesson.open.kind === "session" ? (
				<Button variant="quiet" asChild data-slot="course-action" className={NOW_ROW}>
					<Link href={next.lesson.open.href}>
						<span className="flex shrink-0">{glyph}</span>
						{lines(next.lesson.title, next.why)}
					</Link>
				</Button>
			) : (
				<Button variant="quiet" data-slot="course-action" disabled={busy} onClick={() => onContinue(course.map.workspace)} className={NOW_ROW}>
					<span className="flex shrink-0">{glyph}</span>
					{lines(next.lesson.title, next.why)}
				</Button>
			)}
		</div>
	);
}
