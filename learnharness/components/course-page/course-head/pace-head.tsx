"use client";

import type { ReactNode } from "react";
import { CircleCheckIcon, CircleDotDashedIcon, TriangleAlertIcon } from "lucide-react";
import { ArcPill } from "@/components/course-map/arc-strip";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { PageHead } from "@/components/page-frame/page-frame";
import { MathText } from "@/components/ui/math-text";
import { noExamWords } from "@/components/study-words";
import type { CourseView } from "@/components/course-page/course-model";
import { paceOf, type Pace } from "@/components/course-page/course-head/head-facts";
import { ContextButton, CourseAction, ExamFact, LessonError, StudiedFact } from "@/components/course-page/course-head/head-parts";
import { useCourseRunup } from "@/components/course-page/course-head/use-course-runup";
import { cn } from "@/lib/utils";

const PACE_ICON: Record<Pace["kind"], typeof CircleCheckIcon> = { fits: CircleCheckIcon, started: CircleCheckIcon, unready: CircleDotDashedIcon, short: TriangleAlertIcon };

/**
 * Pace (spec: course-head.md): the head answers "will I be ready for the
 * exam?" in the engine's words, as a project's health leads Linear's
 * project page. Under the title, whether every topic fits before the
 * exam, or the topics the plan has no room for, or inside the run-up the
 * ones not yet solid; then the exam (its run-up on press) and when he
 * last studied (his last session on press). In a course the page leads
 * with arcs, the arc he is in leads that line, as its pill (`ArcPill`),
 * which shows that arc on the page.
 */
export function PaceHead({
	view,
	busy,
	onContinue,
	lead,
	action,
}: {
	view: CourseView;
	busy: boolean;
	onContinue: (workspace: string) => void;
	/** A first line in place of the pace's (the Exam & mistakes candidates). */
	lead?: ReactNode;
	/** A quiet action before Context. */
	action?: ReactNode;
}) {
	const { course, facts } = view;
	const runup = useCourseRunup(course.map.workspace);
	const pace = paceOf(course, runup);
	const Icon = pace ? PACE_ICON[pace.kind] : null;
	const here = view.arcs?.find((a) => a.current) ?? null;
	return (
		<PageHead
			data-head="pace"
			title={<span data-slot="course-title">{course.map.title}</span>}
			actions={
				<>
					{action}
					<ContextButton course={course} />
					<CourseAction view={view} busy={busy} onContinue={onContinue} />
				</>
			}
			lead={
				lead ?? <p data-slot="course-pace" data-kind={pace?.kind} className={cn("flex min-h-5 min-w-0 items-center gap-1.5", pace?.kind === "short" && "text-warning")}>
					{Icon && <Icon aria-hidden className={cn("size-4 shrink-0", pace?.kind !== "short" && "text-muted-foreground")} />}
					{pace ? <MathText>{pace.words}</MathText> : !course.map.exam && <span className="font-normal text-muted-foreground">{noExamWords(course.map.topics)}</span>}
				</p>
			}
			standing={
				<>
					{here && (
						<span data-slot="course-arc-here" className="inline-flex h-5 min-w-0 items-center">
							<ArcPill arc={{ handle: here.arc.handle, title: here.arc.title, share: here.share }} href={arcOnPage(course.map.workspace, here.arc.handle)} />
						</span>
					)}
					{facts.exam && <ExamFact course={course} runup={runup} words={facts.exam} />}
					{facts.studied && <StudiedFact words={facts.studied} session={facts.lastSession} />}
				</>
			}
		>
			<LessonError />
		</PageHead>
	);
}

/** The course page with one arc shown and open: `?arc=<handle>`. */
export function arcOnPage(workspace: string, arc: string): string {
	return `${courseHref(workspace)}?arc=${encodeURIComponent(arc)}`;
}
