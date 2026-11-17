"use client";

import { courseHref } from "@/components/unit-inbox/unit-href";
import { PageHead } from "@/components/page-frame/page-frame";
import type { CourseColumns } from "@/components/course-page/split/split-course";
import { ContextButton, StudiedFact } from "@/components/course-page/course-head/head-parts";
import { StartFailure } from "@/components/start/start-scope";
import { ReadyFact, useHeadStanding } from "@/components/course-page/course-head/ready-fact";
import { MistakesHead, MistakesPress } from "@/components/course-page/standing/mistakes-press";

/**
 * The course page's head (spec: course-head.md): the title with Mistakes
 * and Context, and one line, whether he is ready (`ReadyFact`) and when he
 * last studied. Now (`CourseNow`) follows it across the page, and the exam
 * is a stop on the road below.
 */
export function CourseHead(c: CourseColumns) {
	const { view, standing } = c;
	const { course, facts } = view;
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
						<ReadyFact view={view} ready={ready} />
						{facts.studied && <StudiedFact words={facts.studied} session={facts.lastSession} />}
					</>
				}
			>
				<StartFailure className="flex min-h-5 items-center text-body" />
			</PageHead>
		</MistakesHead>
	);
}

/** The course page with one arc shown and open: `?arc=<handle>`. */
export function arcOnPage(workspace: string, arc: string): string {
	return `${courseHref(workspace)}?arc=${encodeURIComponent(arc)}`;
}
