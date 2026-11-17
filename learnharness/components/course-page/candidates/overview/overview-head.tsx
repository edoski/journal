"use client";

import { PageHead } from "@/components/page-frame/page-frame";
import { MathText } from "@/components/ui/math-text";
import { WhyMark } from "@/components/study-home/agenda-rows/why-mark";
import { ContextButton, CourseAction, ExamFact, LessonError, StudiedFact } from "@/components/course-page/course-head/head-parts";
import { useCourseRunup } from "@/components/course-page/course-head/use-course-runup";
import { MistakesHead, MistakesPress } from "@/components/course-page/standing/mistakes-press";
import type { CourseColumns } from "@/components/course-page/split/split-course";
import { ReadyFact, useHeadStanding } from "@/components/course-page/candidates/shared/ready-fact";
import { nextStep } from "@/components/course-page/candidates/shared/next-step";

/**
 * Overview's head (spec: overview.md): the title with Mistakes, Context
 * and the press; under it, what the press takes up and why, in full ink
 * (`nextStep`); then three facts, each an icon and a few words: the exam
 * (its run-up on press), whether he is ready (the whole answer on press,
 * `ReadyFact`) and when he last studied (his last session on press).
 */
export function OverviewHead({ view, standing, busy, onContinue }: CourseColumns) {
	const { course, facts } = view;
	const runup = useCourseRunup(course.map.workspace);
	const { ready, mistakes } = useHeadStanding(view, standing);
	const next = nextStep(view);
	return (
		<MistakesHead>
			<PageHead
				title={<span data-slot="course-title">{course.map.title}</span>}
				actions={
					<>
						<MistakesPress rows={mistakes} />
						<ContextButton course={course} />
						<CourseAction view={view} busy={busy} onContinue={onContinue} />
					</>
				}
				lead={
					<p data-slot="course-next" className="flex min-w-0 items-center gap-3">
						<span className="min-w-0 truncate">
							<MathText>{next.title}</MathText>
						</span>
						<span className="flex shrink-0 font-normal">
							<WhyMark why={next.why} whole />
						</span>
					</p>
				}
				standing={
					<>
						{facts.exam && <ExamFact course={course} runup={runup} words={facts.exam} ready={null} />}
						<ReadyFact view={view} ready={ready} />
						{facts.studied && <StudiedFact words={facts.studied} session={facts.lastSession} />}
					</>
				}
			>
				<LessonError />
			</PageHead>
		</MistakesHead>
	);
}
