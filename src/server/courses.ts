/**
 * The course chooser's server seam: list the engine's registered courses,
 * and turn a picked workspace into the session's CourseLink. Only a course
 * the engine currently lists can be linked, so a session never points at a
 * directory the engine does not know.
 */

import type { CourseLink, CourseListing } from "../core/contracts/course.ts";
import { courseLabel } from "../core/contracts/course.ts";
import { stores } from "./stores.ts";

export function listCourses(): Promise<CourseListing> {
	return stores.courseRecords.list();
}

/** The link for a picked workspace, or null when no registered course has it. */
export async function courseLinkFor(workspace: string): Promise<CourseLink | null> {
	const listing = await listCourses();
	if (!listing.available) return null;
	const course = listing.courses.find((c) => c.workspace === workspace);
	return course ? { workspace: course.workspace, title: courseLabel(course) } : null;
}
