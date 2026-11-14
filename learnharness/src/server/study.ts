/**
 * The study home's server seam: every listed course's `map`, joined with
 * the run-up and the last day studied from its `plan`. One engine call per verb
 * per course, in parallel; a course whose read fails is named, not fatal.
 */

import type { CourseMap, TopicHandle } from "../core/contracts/course-map.ts";
import { courseLabel, type CourseSummary, type UnreadableCourse } from "../core/contracts/course.ts";
import type { StudyCourse, StudyListing } from "../core/contracts/study.ts";
import { listCourses } from "./courses.ts";
import { stores } from "./stores.ts";

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The home's view of one course from its map and its `plan --days 1`
 *  output (`{courses: [entry]}`). Run-up and due handles the map does not
 *  list are dropped. Pure. */
export function studyCourseOf(map: CourseMap, plan: unknown): StudyCourse {
	const entries = record(plan)?.courses;
	const entry = record(Array.isArray(entries) ? entries[0] : null);
	const listed = new Set<string>(map.topics.map((t) => t.handle));
	const runup = record(entry?.runup);
	const unready = runup
		? (Array.isArray(runup.unready) ? runup.unready : []).filter((h): h is TopicHandle => typeof h === "string" && listed.has(h))
		: null;
	const daysAgo = record(entry?.last_studied)?.days_ago;
	const due = entry
		? (Array.isArray(entry.due) ? entry.due : []).flatMap((d) => {
				const topic = record(d)?.topic;
				return typeof topic === "string" && listed.has(topic) ? [topic as TopicHandle] : [];
			})
		: null;
	const today = record(plan)?.today;
	const first = record((record(entry?.plan)?.days as unknown[] | undefined)?.[0]);
	const newToday =
		first && first.date === today && Array.isArray(first.new)
			? first.new.filter((h): h is TopicHandle => typeof h === "string" && listed.has(h))
			: [];
	return { map, unready, due, lastActiveDaysAgo: typeof daysAgo === "number" ? daysAgo : null, newToday };
}

/** One readable course: its map and its plan's JSON (null when it failed). */
type CourseRead = { map: CourseMap; plan: unknown };

/** Every listed course's map and its `plan` over `days` (or the days a
 *  course asks for), read in parallel: the plan's JSON (null when it
 *  failed). A course the engine could not list, or whose map could not be
 *  read, is in `failed`. */
export async function readCourses(
	days: number | ((course: CourseSummary) => number) = 1,
): Promise<{ available: true; read: CourseRead[]; failed: UnreadableCourse[] } | { available: false; reason: string }> {
	const listing = await listCourses();
	if (!listing.available) return listing;
	const read = await Promise.all(
		listing.courses.map(async (course): Promise<CourseRead | UnreadableCourse> => {
			const [map, plan] = await Promise.all([
				stores.courseRecords.map(course.workspace),
				stores.courseRecords.run(course.workspace, { verb: "plan", days: typeof days === "number" ? days : days(course) }),
			]);
			return map.ok
				? { map: map.map, plan: plan.ok ? plan.json : null }
				: { workspace: course.workspace, title: courseLabel(course), problem: "unreadable" };
		}),
	);
	return {
		available: true,
		read: read.flatMap((c) => ("map" in c ? [c] : [])),
		failed: [...listing.unreadable, ...read.flatMap((c) => ("map" in c ? [] : [c]))],
	};
}

export async function studyStatus(): Promise<StudyListing> {
	const listing = await readCourses();
	if (!listing.available) return listing;
	return { available: true, courses: listing.read.map((c) => studyCourseOf(c.map, c.plan)), failed: listing.failed };
}
