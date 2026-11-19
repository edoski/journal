/**
 * The study home's server seam: every listed course's `map`, joined with
 * the run-up and the last day studied from its `plan`. One engine call per verb
 * per course, in parallel; a course whose read fails is named, not fatal.
 */

import type { CourseMap, TopicHandle } from "../core/contracts/course-map.ts";
import type { ChatSummary } from "../core/contracts/chat.ts";
import { courseLabel, type CourseSummary, type UnreadableCourse } from "../core/contracts/course.ts";
import type { StudyCourse, StudyListing } from "../core/contracts/study.ts";
import type { StudyWindow } from "../core/contracts/calendar.ts";
import { lessonTopics } from "../core/course-map-build.ts";
import { listCoursesRead } from "./courses.ts";
import { stores } from "./stores.ts";
import { scheduleOf } from "./study-schedule.ts";

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

/** A course's map as Home reads it, told the lesson in progress there
 *  (`lessonTopics`), so every reader of it shares the engine's one kept map. */
export function homeMap(workspace: string, chats: readonly ChatSummary[] = stores.chatStore.listChats()) {
	return stores.courseRecords.map(workspace, lessonTopics(chats, workspace)[0]);
}

/** One readable course: its map and its plan's JSON (null when it failed). */
type CourseRead = { map: CourseMap; plan: unknown };

/** One course's entry in `plan --all`'s output, as that course's own
 *  `plan` prints it (`{…, courses: [entry]}`); null when it is not there. */
export function ownPlanOf(all: unknown, workspace: string): unknown {
	const listing = record(all);
	const entry = Array.isArray(listing?.courses) ? listing.courses.find((c) => record(c)?.workspace === workspace) : undefined;
	return listing && entry ? { ...listing, courses: [entry] } : null;
}

/** Every listed course's map, told the lesson in progress there, and its
 *  `plan` over `days` (or the days a course asks for), read in parallel:
 *  the plan's JSON (null when it failed). A day's plan is the course's
 *  entry in the listing's own `plan --all --days 1` (round 13, N2: Home
 *  ran that plan again for every course). A course the engine could not
 *  list, or whose map could not be read, is in `failed`. */
export async function readCourses(
	days: number | ((course: CourseSummary) => number) = 1,
): Promise<{ available: true; read: CourseRead[]; failed: UnreadableCourse[]; all?: unknown } | { available: false; reason: string }> {
	const chats = stores.chatStore.listChats();
	const mapOf = (workspace: string) => homeMap(workspace, chats);
	// Each registered course's map starts beside the listing's plan, not after
	// it: each is the engine replaying every course, so one after the other
	// doubled Home's wait (round 15, P7).
	const early = new Map((stores.courseRecords.registered?.() ?? []).map((workspace) => [workspace, mapOf(workspace)]));
	const listing = await listCoursesRead();
	if (!listing.available) return listing;
	const all = "plan" in listing ? listing.plan : undefined;
	const read = await Promise.all(
		listing.courses.map(async (course): Promise<CourseRead | UnreadableCourse> => {
			const horizon = typeof days === "number" ? days : days(course);
			const listed = horizon === 1 ? ownPlanOf(all, course.workspace) : null;
			const [map, plan] = await Promise.all([
				early.get(course.workspace) ?? mapOf(course.workspace),
				listed ? { ok: true as const, json: listed } : stores.courseRecords.run(course.workspace, { verb: "plan", days: horizon }),
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
		all,
	};
}

/** The learner's own calendar day of a moment, YYYY-MM-DD: the engine's
 *  study day is the local date, so a session's day is too. */
function localDay(iso: string): string {
	const at = new Date(iso);
	return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}

/** A course's last study counting its sessions too: the engine's
 *  `last_studied` moves only with an attempt or a topic taught, so a
 *  session started minutes ago read "3d ago". `sessions` are the days of
 *  the course's sessions he wrote in. Pure. */
export function withSessionStudy(course: StudyCourse, sessions: readonly string[]): StudyCourse {
	const { today } = course.map;
	const days = sessions.map((day) => Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000)));
	const newest = days.length > 0 ? Math.min(...days) : null;
	if (newest === null) return course;
	return { ...course, lastActiveDaysAgo: course.lastActiveDaysAgo === null ? newest : Math.min(course.lastActiveDaysAgo, newest) };
}

/** Today's study windows in his Journal, from the listing's
 *  `plan --all --days 1` (its `today` and `journal.upcoming_schedule`); none
 *  on a day off or without a Journal. Pure. */
export function todayHours(all: unknown): StudyWindow[] {
	const today = record(all)?.today;
	return [...(scheduleOf(all).find((day) => day.date === today)?.windows ?? [])];
}

export async function studyStatus(): Promise<StudyListing> {
	const listing = await readCourses();
	if (!listing.available) return listing;
	const chats = stores.chatStore.listChats().filter((c) => c.course && c.messageCount > 0);
	const daysOf = (workspace: string) => chats.filter((c) => c.course!.workspace === workspace).map((c) => localDay(c.updatedAt));
	return { available: true, courses: listing.read.map((c) => withSessionStudy(studyCourseOf(c.map, c.plan), daysOf(c.map.workspace))), failed: listing.failed, hours: todayHours(listing.all) };
}
