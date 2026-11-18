"use client";

import { CourseFrame } from "@/components/course-page/course-frame";
import { SplitBody } from "@/components/course-page/split/split-course";

/**
 * One course's page, `/unit/<course>` (spec: course-page.md): the course
 * as a road to its exam, its arcs in study order beside the course's map.
 */
export function CoursePage({ workspace }: { workspace: string }) {
	return <CourseFrame workspace={workspace}>{(ready) => <SplitBody {...ready} />}</CourseFrame>;
}
