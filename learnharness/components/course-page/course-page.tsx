"use client";

import { SplitCourse } from "@/components/course-page/split/split-course";
import { useCoursePageVariant } from "@/components/course-page/course-page-variant";
import { OverviewCourse } from "@/components/course-page/candidates/overview/overview-course";
import { AgendaCourse } from "@/components/course-page/candidates/agenda/agenda-course";
import { RoadCourse } from "@/components/course-page/candidates/road/road-course";
import { RoadRowsCourse } from "@/components/course-page/candidates/roadrows/roadrows-course";

/**
 * One course's page, `/unit/<course>` (spec: course-page.md): the topic
 * list beside the course's map (`split/`), or one of its candidates
 * (`candidates/candidates.md`) while the `coursepage` switch picks one.
 */
export function CoursePage({ workspace }: { workspace: string }) {
	switch (useCoursePageVariant()) {
		case "current":
			return <SplitCourse workspace={workspace} />;
		case "overview":
			return <OverviewCourse workspace={workspace} />;
		case "agenda":
			return <AgendaCourse workspace={workspace} />;
		case "road":
			return <RoadCourse workspace={workspace} />;
		case "roadrows":
			return <RoadRowsCourse workspace={workspace} />;
	}
}
