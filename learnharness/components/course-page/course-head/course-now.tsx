"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { MathLine } from "@/components/ui/math-line";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { standingOf } from "@/components/course-map/topic-map/topic-standing";
import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { ProgressRing } from "@/components/study-home/agenda-rows/progress-ring";
import { WhyMark } from "@/components/study-home/agenda-rows/why-mark";
import { lessonOf } from "@/components/study-home/lesson-facts";
import type { CourseColumns } from "@/components/course-page/split/split-course";
import { cn } from "@/lib/utils";

const NOW_ROW = "group/press -mx-3 flex h-14 w-[calc(100%+1.5rem)] items-center gap-4 rounded-lg px-3 text-left font-normal whitespace-normal";

/** The press's word at the row's end: a 32px pill in the send button's fill, centred on the row, its arrow
 *  stepping right on hover (the row itself is the press). */
function Press({ words }: { words: string }) {
	return (
		<span data-slot="course-now-press" className={cn(buttonVariants({ size: "pill" }), "pointer-events-none shrink-0 self-center font-medium")}>
			{words}
			<ArrowRightIcon aria-hidden className="size-4 transition-transform duration-150 group-hover/press:translate-x-0.5 motion-reduce:transition-none" />
		</span>
	);
}

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
	const glyph = lead ? <TopicGlyph standing={standingOf(lead)} /> : <ProgressRing course={course} />;
	const action = line ? lessonOf(line.row).action : next.lesson.action;
	const word = action === "Open" ? "Resume" : action;
	// The title on the first line, the reason under it; the press's pill sits centred at the row's end.
	const lines = (title: string, why: typeof next.why) => (
		<>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<MathLine className="min-w-0 text-headline text-foreground">{title}</MathLine>
				<span className="flex min-w-0 overflow-hidden [&_[data-slot=today-why]]:max-w-full">
					<WhyMark why={why} />
				</span>
			</span>
			<Press words={word} />
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
