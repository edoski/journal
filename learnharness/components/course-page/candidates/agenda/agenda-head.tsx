"use client";

import { PageHead } from "@/components/page-frame/page-frame";
import { ContextButton, ExamFact, LessonError } from "@/components/course-page/course-head/head-parts";
import { useCourseRunup } from "@/components/course-page/course-head/use-course-runup";
import { MistakesHead, MistakesPress } from "@/components/course-page/standing/mistakes-press";
import type { CourseColumns } from "@/components/course-page/split/split-course";
import { ReadyFact, useHeadStanding } from "@/components/course-page/candidates/shared/ready-fact";

/**
 * Agenda's head (spec: agenda.md): the title with Mistakes and Context,
 * and one line under it, the exam (its run-up on press) and whether he is
 * ready (`ReadyFact`). The press is the list's Now row, so the head has
 * none.
 */
export function AgendaHead({ view, standing }: CourseColumns) {
	const { course, facts } = view;
	const runup = useCourseRunup(course.map.workspace);
	const { ready, mistakes } = useHeadStanding(view, standing);
	return (
		<MistakesHead>
			<PageHead
				compact
				title={<span data-slot="course-title">{course.map.title}</span>}
				actions={
					<>
						<MistakesPress rows={mistakes} />
						<ContextButton course={course} />
					</>
				}
				standing={
					<>
						{facts.exam && <ExamFact course={course} runup={runup} words={facts.exam} ready={null} />}
						<ReadyFact view={view} ready={ready} />
					</>
				}
			>
				<LessonError />
			</PageHead>
		</MistakesHead>
	);
}
