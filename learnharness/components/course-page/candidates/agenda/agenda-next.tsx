"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathLine } from "@/components/ui/math-line";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { standingOf } from "@/components/course-map/topic-map/topic-standing";
import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { ProgressRing } from "@/components/study-home/agenda-rows/progress-ring";
import { WhyMark } from "@/components/study-home/agenda-rows/why-mark";
import { Hint } from "@/components/ui/hint";
import { lessonOf } from "@/components/study-home/lesson-facts";
import { THEN_WORDS } from "@/components/course-page/what-next";
import type { CourseColumns } from "@/components/course-page/split/split-course";
import { cn } from "@/lib/utils";

const NOW_ROW = "group/press -mx-3 flex h-14 w-[calc(100%+1.5rem)] items-center gap-4 rounded-lg px-3 text-left font-normal whitespace-normal";

/** The press's word at the row's end, in the accent, its arrow stepping right on hover. */
function Press({ words }: { words: string }) {
	return (
		<span className="inline-flex shrink-0 items-center gap-1.5 text-headline text-link">
			{words}
			<ArrowRightIcon aria-hidden className="size-4 transition-transform duration-150 group-hover/press:translate-x-0.5 motion-reduce:transition-none" />
		</span>
	);
}

/**
 * Agenda's Now and Then (spec: agenda.md): Now, the step the course's press
 * takes up, as Today's row says it (its title, its reason's icon and
 * words, the press's word flush right beside them), which does what
 * Today's line does; Then, one quiet line naming the next new topic the
 * plan starts, why then in its hint, which opens its page. A hairline closes them off from the arc.
 */
export function AgendaNext({ view, busy, onContinue }: CourseColumns) {
	const { course, whatNext, next } = view;
	const line = whatNext?.pickUp?.line ?? null;
	const then = whatNext?.then ?? null;
	const lead = line ? (line.lead ?? line.topics[0] ?? null) : null;
	const glyph = lead ? <TopicGlyph standing={standingOf(lead)} /> : <ProgressRing course={course} />;
	const action = line ? lessonOf(line.row).action : next.lesson.action;
	const word = action === "Open" ? "Resume" : action;
	// The title takes the first line whole; the reason and the press's word share the second, the reason giving way.
	const lines = (title: string, why: typeof next.why) => (
		<span className="flex min-w-0 flex-1 flex-col gap-0.5">
			<MathLine className="min-w-0 text-headline text-foreground">{title}</MathLine>
			<span className="flex min-w-0 items-center gap-3">
				<span className="flex min-w-0 flex-1 overflow-hidden [&_[data-slot=today-why]]:max-w-full">
					<WhyMark why={why} />
				</span>
				<Press words={word} />
			</span>
		</span>
	);
	return (
		<div data-slot="agenda-next" className="mb-3 flex shrink-0 flex-col border-b border-border/50 pb-2">
			{line ? (
				<LineTarget row={line.row} busy={busy} onContinue={onContinue} data-slot="agenda-now" className={NOW_ROW}>
					<span className="flex shrink-0">{glyph}</span>
					{lines(line.title, line.why)}
				</LineTarget>
			) : next.lesson.open.kind === "session" ? (
				<Button variant="quiet" asChild data-slot="agenda-now" className={NOW_ROW}>
					<Link href={next.lesson.open.href}>
						<span className="flex shrink-0">{glyph}</span>
						{lines(next.lesson.title, next.why)}
					</Link>
				</Button>
			) : (
				<Button variant="quiet" data-slot="agenda-now" disabled={busy} onClick={() => onContinue(course.map.workspace)} className={NOW_ROW}>
					<span className="flex shrink-0">{glyph}</span>
					{lines(next.lesson.title, next.why)}
				</Button>
			)}
			{then && (
				<Hint label={then.why} side="right">
					<Button variant="quiet" asChild data-slot="agenda-then" className={cn(NOW_ROW, "h-9 text-body")}>
						<Link href={then.href}>
							<span className="flex shrink-0">
								<TopicGlyph standing={standingOf(then.topic)} />
							</span>
							<span className="flex min-w-0 flex-1 items-center gap-2">
								<span className="shrink-0 text-muted-foreground">{THEN_WORDS}</span>
								<MathLine className="min-w-0 text-foreground">{then.topic.title}</MathLine>
							</span>
						</Link>
					</Button>
				</Hint>
			)}
		</div>
	);
}
