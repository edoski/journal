"use client";

import { useCourseHeadVariant } from "@/components/design-variant";
import { CourseHeader } from "@/components/course-page/course-header";
import type { CourseView } from "@/components/course-page/course-model";
import { BriefHead } from "@/components/course-page/course-head/brief-head";
import { PaceHead } from "@/components/course-page/course-head/pace-head";
import { RoadHead } from "@/components/course-page/course-head/road-head";

/** The course page's head: Current, or one of the three candidates
 *  (spec: course-head.md), by the one `course-head` switch. */
export function CourseHead(props: { view: CourseView; busy: boolean; onContinue: (workspace: string) => void }) {
	switch (useCourseHeadVariant()) {
		case "pace":
			return <PaceHead {...props} />;
		case "brief":
			return <BriefHead {...props} />;
		case "road":
			return <RoadHead {...props} />;
		default:
			return <CourseHeader {...props} />;
	}
}
