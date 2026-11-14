"use client";

import { SplitCourse } from "@/components/course-page/split/split-course";

/**
 * One course's page, `/unit/<course>` (spec: course-page.md): the topic
 * list beside the course's map (`split/`).
 */
export function CoursePage({ workspace }: { workspace: string }) {
	return <SplitCourse workspace={workspace} />;
}
