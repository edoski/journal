"use client";

import { BookOpenIcon, HistoryIcon } from "lucide-react";
import { PageHead } from "@/components/page-frame/page-frame";
import { MathText } from "@/components/ui/math-text";
import { finalReviewWords } from "@/components/calendar/calendar-facts";
import type { CourseView } from "@/components/course-page/course-model";
import { aheadWords, nextStartOf, untaughtLeft } from "@/components/course-page/course-head/head-facts";
import { ContextButton, CourseAction, ExamFact, LessonError, StudiedFact } from "@/components/course-page/course-head/head-parts";
import { useCourseRunup } from "@/components/course-page/course-head/use-course-runup";

/**
 * Road (spec: course-head.md): the head shows what comes after today,
 * which the rows under it do not, as a deadline's road in Things or a
 * course's week ahead in Coursera. Under the title, the next new topics
 * the engine's daily plan starts and the day ("Next new topic Poisson
 * distribution on Thursday"), then when the final review starts; then the
 * exam and when he last studied. An arc, once the engine has them, leads
 * the line: "In <arc>, next <arc> from Thursday".
 */
export function RoadHead({ view, busy, onContinue }: { view: CourseView; busy: boolean; onContinue: (workspace: string) => void }) {
	const { course, facts } = view;
	const runup = useCourseRunup(course.map.workspace);
	const next = nextStartOf(course, runup);
	const finalReview = runup ? finalReviewWords(runup.finalReview, course.map.today) : null;
	const left = untaughtLeft(course);
	return (
		<PageHead
			data-head="road"
			title={<span data-slot="course-title">{course.map.title}</span>}
			actions={
				<>
					<ContextButton course={course} />
					<CourseAction view={view} busy={busy} onContinue={onContinue} />
				</>
			}
			lead={
				<p data-slot="course-road" className="flex min-h-5 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
					{next ? (
						<span data-slot="course-road-next" className="inline-flex min-w-0 items-center gap-1.5">
							<BookOpenIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
							<span className="font-normal text-muted-foreground">Next new topic</span>
							<MathText>{next.titles.join(", ")}</MathText>
							<span className="font-normal text-muted-foreground">{aheadWords(next.day, course.map.today)}</span>
						</span>
					) : (
						runup && <span className="font-normal text-muted-foreground">{left ? "No new topic planned yet" : "Every topic started"}</span>
					)}
					{finalReview && (
						<span data-slot="course-road-final" className="inline-flex items-center gap-1.5 font-normal text-muted-foreground">
							<HistoryIcon aria-hidden className="size-4 shrink-0" />
							{finalReview}
						</span>
					)}
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
