"use client";

import { useMemo } from "react";
import { CalendarOffIcon, CircleCheckIcon, CircleDotDashedIcon, TriangleAlertIcon } from "lucide-react";
import type { CourseStanding } from "@/src/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/hint";
import { MathText } from "@/components/ui/math-text";
import { READY_FACT_WORDS, noExamWords } from "@/components/study-words";
import type { CourseView } from "@/components/course-page/course-model";
import { FACT, MARK, PRESS } from "@/components/course-page/course-head/head-parts";
import { ExamGapLine } from "@/components/course-page/course-head/exam-gaps";
import { examGaps } from "@/components/course-page/course-head/head-facts";
import { ReadyWords } from "@/components/course-page/standing/ready-line";
import { examReady, mistakeRows, type ExamReady } from "@/components/course-page/standing/standing-model";
import { cn } from "@/lib/utils";

const ICON: Record<ExamReady["kind"], typeof CircleCheckIcon> = { ready: CircleCheckIcon, notYet: CircleDotDashedIcon, short: TriangleAlertIcon };

/** What the head reads from the engine's standing: whether he is ready
 *  for the exam, and the open mistakes. */
export function useHeadStanding(view: CourseView, standing: CourseStanding | null) {
	const { course, arcs, chats } = view;
	const ready = useMemo(() => (standing?.readiness ? examReady(standing.readiness, course.map, arcs, standing.mistakes) : null), [standing, course.map, arcs]);
	const mistakes = useMemo(() => (standing ? mistakeRows(standing, course, chats) : []), [standing, course, chats]);
	return { ready, mistakes };
}

/**
 * Whether he is ready for the exam, as one fact of a head (spec:
 * course-head.md): an icon and a few words ("Not ready for the exam yet",
 * "Ready for the exam"), never a pill per arc; when the plan cannot fit all
 * of it, what it loses in the warning ink ("No room before the exam to
 * start Geometric distribution and Variance"; round 15, M7: "Not all of it
 * fits" hid the loss behind a click). Pressed, it opens the whole answer under it: the readiness
 * words the run-up says (`ReadyWords`) and what the exam's plan leaves out
 * with its way in (`ExamGapLine`); not ready with nothing more to say, it
 * is the fact alone. A course without an exam says "No exam",
 * what the plan does with its reviews in its hint. Nothing while the
 * engine cannot say.
 */
export function ReadyFact({ view, ready }: { view: CourseView; ready: ExamReady | null }) {
	const { course, chats } = view;
	const { map } = course;
	if (!map.exam) {
		return (
			<Hint label={noExamWords(map.topics)} side="bottom">
				<span data-slot="course-ready-fact" data-kind="none" tabIndex={0} className={PRESS}>
					<CalendarOffIcon aria-hidden className={MARK} />
					{READY_FACT_WORDS.none}
				</span>
			</Hint>
		);
	}
	if (!ready) return null;
	const Icon = ICON[ready.kind];
	// Not ready, with every topic still fitting and nothing more to name: the fact alone, no press that only
	// repeats it (round 16, m6: "Not ready yet in" over six of seven arcs, 25 days before the exam).
	if (ready.kind === "notYet" && !ready.rest && !examGaps(map)) {
		return (
			<span data-slot="course-ready-fact" data-kind={ready.kind} className={FACT}>
				<Icon aria-hidden className={MARK} />
				{READY_FACT_WORDS.notYet}
			</span>
		);
	}
	return (
		<Popover>
			<PopoverTrigger data-slot="course-ready-fact" data-kind={ready.kind} className={cn(PRESS, ready.kind === "short" && "text-warning hover:text-warning data-[state=open]:text-warning")}>
				<Icon aria-hidden className={MARK} />
				{ready.kind === "short" ? <MathText>{ready.words}</MathText> : READY_FACT_WORDS[ready.kind]}
			</PopoverTrigger>
			<PopoverContent data-slot="course-ready-detail" align="start" collisionPadding={12} className="flex flex-col gap-3">
				{ready.kind !== "short" && (
					<p className="text-callout text-foreground">
						<ReadyWords ready={ready} workspace={map.workspace} />
					</p>
				)}
				<ExamGapLine course={course} chats={chats} />
			</PopoverContent>
		</Popover>
	);
}
