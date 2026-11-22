"use client";

import { useMemo } from "react";
import { CalendarOffIcon, CircleCheckIcon, CircleDotDashedIcon, SproutIcon, TriangleAlertIcon } from "lucide-react";
import type { CourseStanding } from "@/src/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/hint";
import { MathText } from "@/components/ui/math-text";
import { READY_FACT_WORDS, SELF_STUDY_WORDS, closingCheckWords, noExamWords } from "@/components/study-words";
import { Button } from "@/components/ui/button";
import { useStartScope } from "@/components/start/start-scope";
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
	if (map.selfStudy) return <SelfStudyFact view={view} />;
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
	// Not ready, with every topic still fitting and nothing more to name: no line, since a bare "Not ready for the
	// exam yet" gives him nothing to act on (round 16, m6: "Not ready yet in" over six of seven arcs; round 17, m7:
	// the bare fact 16 to 24 days out, opening nothing).
	if (ready.kind === "notYet" && !ready.rest && !examGaps(map)) return null;
	return (
		<Popover>
			{/* What won't fit wraps inside the head's column, its mark on the first line (round 17, M3: nine topics ran
			    the line off the window on the exam eve). */}
			<PopoverTrigger data-slot="course-ready-fact" data-kind={ready.kind} className={cn(PRESS, ready.kind === "short" && "h-auto min-h-5 items-start whitespace-normal text-left text-warning hover:text-warning data-[state=open]:text-warning")}>
				<Icon aria-hidden className={cn(MARK, ready.kind === "short" && "mt-0.5")} />
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

/**
 * A self-study's fact, where a course's says whether he is ready for its
 * exam (22 Nov 2026): "Self-study", whose hint says it has no exam and no
 * reviews and is done once every topic is learned. Once it is, "Learned",
 * which opens the one offer it makes, a closing check: one practice
 * session across every topic, if he wants it.
 */
function SelfStudyFact({ view }: { view: CourseView }) {
	const { map } = view.course;
	const { start, starting } = useStartScope();
	if (!map.selfStudy?.goalReached) {
		return (
			<Hint label={SELF_STUDY_WORDS.hint} side="bottom">
				<span data-slot="course-ready-fact" data-kind="self-study" tabIndex={0} className={PRESS}>
					<SproutIcon aria-hidden className={MARK} />
					{SELF_STUDY_WORDS.name}
				</span>
			</Hint>
		);
	}
	const topics = map.topics.filter((t) => t.excluded === undefined).map((t) => t.handle);
	const title = closingCheckWords(map.title);
	return (
		<Popover>
			<PopoverTrigger data-slot="course-ready-fact" data-kind="learned" className={PRESS}>
				<CircleCheckIcon aria-hidden className={MARK} />
				{SELF_STUDY_WORDS.reached}
			</PopoverTrigger>
			<PopoverContent data-slot="course-ready-detail" align="start" collisionPadding={12} className="flex flex-col gap-3">
				<p className="text-callout text-foreground">{SELF_STUDY_WORDS.reachedLine}</p>
				<Hint label={SELF_STUDY_WORDS.checkHint} side="bottom">
					<Button
						variant="quiet"
						size="xs"
						data-slot="closing-check"
						disabled={starting !== null}
						onClick={() => start({ title, kind: "practice", course: { workspace: map.workspace }, topics }, { key: "closing-check" })}
						className="self-start text-link hover:text-link"
					>
						{SELF_STUDY_WORDS.check}
					</Button>
				</Hint>
			</PopoverContent>
		</Popover>
	);
}
