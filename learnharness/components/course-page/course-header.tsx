"use client";

import { createContext, useContext } from "react";
import { ArrowRightIcon, CalendarIcon, ClockIcon } from "lucide-react";
import { WHY_ICON } from "@/components/study-home/agenda-rows/why-mark";
import { ProgressPie } from "@/components/study-home/agenda-rows/progress-pie";
import { LessonButton } from "@/components/study-home/lesson-button";
import type { CourseView } from "@/components/course-page/course-model";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

/** Why the header's button could not start a lesson, set by the course frame
 *  around every candidate so the alert shows under the button he pressed. */
export const CourseLessonError = createContext<string | null>(null);

/** One fact of the facts line: a 16px mark, then a few words. */
function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
	return (
		<span data-slot="course-fact" className="inline-flex h-5 min-w-0 items-center gap-1.5 whitespace-nowrap">
			{icon}
			{children}
		</span>
	);
}

/**
 * The course page's header (spec: course-header.md), the same on every
 * candidate: the course's name with its one button (Home's lesson button
 * for this course: Resume, Review, Continue or Start), the facts line (how
 * many topics he can do on his own, the exam, when he last studied), then
 * what the button takes up and why it is next, in Today's words.
 */
export function CourseHeader({ view, busy, onContinue, className }: { view: CourseView; busy: boolean; onContinue: (workspace: string) => void; className?: string }) {
	const { course, facts, next } = view;
	const error = useContext(CourseLessonError);
	const WhyIcon = next.why ? WHY_ICON[next.why.kind] : ArrowRightIcon;
	return (
		<header data-slot="course-header" className={cn("flex shrink-0 flex-col gap-2", className)}>
			<div className="flex h-8 items-center justify-between gap-4">
				<h1 data-slot="course-title" className="min-w-0 truncate text-xl font-semibold text-foreground">
					{course.map.title}
				</h1>
				<LessonButton lesson={next.lesson} busy={busy} onContinue={onContinue} size="sm" data-slot="course-action" className="shrink-0 text-row">
					{next.action}
				</LessonButton>
			</div>
			<p data-slot="course-facts" className="flex h-5 min-w-0 items-center gap-x-4 overflow-hidden text-row text-muted-foreground tabular-nums">
				{facts.progress && <Fact icon={<ProgressPie course={course} />}>{facts.progress}</Fact>}
				{facts.exam && <Fact icon={<CalendarIcon aria-hidden className="size-4 shrink-0" />}>{facts.exam}</Fact>}
				{facts.studied && <Fact icon={<ClockIcon aria-hidden className="size-4 shrink-0" />}>{facts.studied}</Fact>}
			</p>
			<p data-slot="course-next" className="flex h-5 min-w-0 items-center gap-1.5 text-row text-foreground">
				<WhyIcon aria-hidden className={cn("size-4 shrink-0", next.why?.kind === "reply" ? "text-link" : "text-muted-foreground")} />
				<span className="truncate">
					<MathText>{next.lesson.title}</MathText>
				</span>
				{next.why && (
					<span data-slot="course-next-why" className={cn("ml-1 shrink-0 whitespace-nowrap", next.why.kind === "reply" ? "font-medium text-link" : "text-muted-foreground")}>
						<MathText>{next.why.short}</MathText>
					</span>
				)}
			</p>
			{error && (
				<p role="alert" data-slot="course-lesson-error" className="flex min-h-5 items-center text-row text-danger">
					{error}
				</p>
			)}
		</header>
	);
}
