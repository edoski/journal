/**
 * The study home's server seam: every listed course's `map`, joined with
 * the run-up and last activity from its `plan`. One engine call per verb
 * per course, in parallel; a course whose read fails is named, not fatal.
 */

import type { CourseMap, TopicHandle } from "../core/contracts/course-map.ts";
import type { StudyCourse, StudyListing } from "../core/contracts/study.ts";
import { listCourses } from "./courses.ts";
import { stores } from "./stores.ts";

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The home's view of one course from its map and its `plan --days 1`
 *  output (`{courses: [entry]}`). Run-up handles the map does not list are
 *  dropped. Pure. */
export function studyCourseOf(map: CourseMap, plan: unknown): StudyCourse {
	const entries = record(plan)?.courses;
	const entry = record(Array.isArray(entries) ? entries[0] : null);
	const listed = new Set<string>(map.topics.map((t) => t.handle));
	const runup = record(entry?.runup);
	const unready = runup
		? (Array.isArray(runup.unready) ? runup.unready : []).filter((h): h is TopicHandle => typeof h === "string" && listed.has(h))
		: null;
	const daysAgo = record(entry?.last_activity)?.days_ago;
	return { map, unready, lastActiveDaysAgo: typeof daysAgo === "number" ? daysAgo : null };
}

export async function studyStatus(): Promise<StudyListing> {
	const listing = await listCourses();
	if (!listing.available) return listing;
	const read = await Promise.all(
		listing.courses.map(async (course) => {
			const [map, plan] = await Promise.all([
				stores.courseRecords.map(course.workspace),
				stores.courseRecords.run(course.workspace, { verb: "plan" }),
			]);
			return map.ok ? studyCourseOf(map.map, plan.ok ? plan.json : null) : course.workspace;
		}),
	);
	return {
		available: true,
		courses: read.filter((c): c is StudyCourse => typeof c !== "string"),
		failed: read.filter((c): c is string => typeof c === "string"),
	};
}
