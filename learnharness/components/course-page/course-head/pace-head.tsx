"use client";

import { CircleCheckIcon, CircleDotDashedIcon, TriangleAlertIcon } from "lucide-react";
import { PageHead } from "@/components/page-frame/page-frame";
import { MathText } from "@/components/ui/math-text";
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
 * last studied (his last session on press). An arc, once the engine has
 * them, leads the standing line: "In <arc>".
 */
export function PaceHead({ view, busy, onContinue }: { view: CourseView; busy: boolean; onContinue: (workspace: string) => void }) {
	const { course, facts } = view;
	const runup = useCourseRunup(course.map.workspace);
	const pace = paceOf(course, runup);
	const Icon = pace ? PACE_ICON[pace.kind] : null;
	return (
		<PageHead
			data-head="pace"
			title={<span data-slot="course-title">{course.map.title}</span>}
			actions={
				<>
					<ContextButton course={course} />
					<CourseAction view={view} busy={busy} onContinue={onContinue} />
				</>
			}
			lead={
				<p data-slot="course-pace" data-kind={pace?.kind} className={cn("flex min-h-5 min-w-0 items-center gap-1.5", pace?.kind === "short" && "text-warning")}>
					{Icon && <Icon aria-hidden className={cn("size-4 shrink-0", pace?.kind !== "short" && "text-muted-foreground")} />}
					{pace ? <MathText>{pace.words}</MathText> : !course.map.exam && <span className="font-normal text-muted-foreground">No exam day set</span>}
				</p>
			}
			standing={
				<>
					{facts.exam && <ExamFact course={course} runup={runup} words={facts.exam} />}
					{facts.studied && <StudiedFact words={facts.studied} session={facts.lastSession} />}
				</>
			}
		>
			<LessonError />
		</PageHead>
	);
}
