"use client";

import { createContext, useContext, useState } from "react";
import { ArrowRightIcon, CalendarIcon, ClockIcon, FilePlusIcon } from "lucide-react";
import { AddMaterialDialog } from "@/components/course-manage-dialogs";
import { Button } from "@/components/ui/button";
import { WHY_ICON } from "@/components/study-home/agenda-rows/why-mark";
import { ProgressRing } from "@/components/study-home/agenda-rows/progress-ring";
import { PageAction, PageFact, PageHead } from "@/components/page-frame/page-frame";
import type { CourseView } from "@/components/course-page/course-model";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

/** Why the header's button could not start a lesson, set by the course frame
 *  around every candidate so the alert shows under the button he pressed. */
export const CourseLessonError = createContext<string | null>(null);

/**
 * The course page's head (spec: course-header.md), the shared page head
 * (`PageHead`, page-frame.md): the course's name with Add material and the
 * page's press (what Home's line for this course does: Resume, Review,
 * Continue or Start), then what the press takes up and why it is next,
 * in Today's words, as the head's lead, then the standing line under it
 * (the course's progress ring and how far along it is, the exam, when he
 * last studied).
 */
export function CourseHeader({ view, busy, onContinue, className }: { view: CourseView; busy: boolean; onContinue: (workspace: string) => void; className?: string }) {
	const { course, facts, next } = view;
	const error = useContext(CourseLessonError);
	const WhyIcon = next.why ? WHY_ICON[next.why.kind] : ArrowRightIcon;
	const [adding, setAdding] = useState(false);
	const { open } = next.lesson;
	return (
		<PageHead
			className={className}
			title={<span data-slot="course-title">{course.map.title}</span>}
			actions={
				<>
					<Button variant="quiet" size="row" data-slot="course-add-material" onClick={() => setAdding(true)}>
						<FilePlusIcon aria-hidden />
						Add material
					</Button>
					<PageAction
						data-slot="course-action"
						disabled={busy}
						{...(open.kind === "session" ? { href: open.href } : { onClick: () => onContinue(open.workspace) })}
					>
						{next.action}
					</PageAction>
				</>
			}
			lead={
				<p data-slot="course-next" className="flex min-h-5 min-w-0 items-center gap-1.5">
					<WhyIcon aria-hidden className={cn("size-4 shrink-0", next.why?.kind === "reply" ? "text-link" : "text-muted-foreground")} />
					<span className="min-w-0">
						<MathText>{next.lesson.title}</MathText>
					</span>
					{next.why && (
						<span data-slot="course-next-why" className={cn("ml-1 shrink-0 whitespace-nowrap", next.why.kind === "reply" ? "text-link" : "font-normal text-muted-foreground")}>
							<MathText>{next.why.short}</MathText>
						</span>
					)}
				</p>
			}
			standing={
				<>
					{facts.progress && <PageFact icon={<ProgressRing course={course} />}>{facts.progress}</PageFact>}
					{facts.exam && <PageFact icon={<CalendarIcon aria-hidden className="size-4 shrink-0" />}>{facts.exam}</PageFact>}
					{facts.studied && <PageFact icon={<ClockIcon aria-hidden className="size-4 shrink-0" />}>{facts.studied}</PageFact>}
				</>
			}
		>
			{error && (
				<p role="alert" data-slot="course-lesson-error" className="flex min-h-5 items-center text-row text-danger">
					{error}
				</p>
			)}
			{adding && <AddMaterialDialog course={{ workspace: course.map.workspace, title: course.map.title }} onClose={() => setAdding(false)} />}
		</PageHead>
	);
}
