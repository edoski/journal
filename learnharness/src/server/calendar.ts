/**
 * The calendar's server seam: the study home's read of every course, with
 * `plan` asked for six weeks ahead, the most a month view shows, so it
 * also gives the daily plan for those days, the run-up's figures and the
 * Journal's study windows. The study windows are the vault's, the same for every
 * course, so the first plan that lists them is read.
 */

import type { CalendarListing, CalendarRunup, PlannedDay, ScheduledDay, StudyWindow } from "../core/contracts/calendar.ts";
import type { CourseMap, TopicHandle } from "../core/contracts/course-map.ts";
import { readCourses, studyCourseOf } from "./study.ts";

/** How many days ahead `plan` looks: the six weeks a month view can show. */
export const CALENDAR_DAYS = 42;

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function courseEntry(plan: unknown): Record<string, unknown> | null {
	const courses = record(plan)?.courses;
	return record(Array.isArray(courses) ? courses[0] : null);
}

/** `plan`'s `runup.study_days` and `pace`, or null when it gives neither. Pure. */
export function runupOf(plan: unknown): CalendarRunup | null {
	const runup = record(courseEntry(plan)?.runup);
	const { study_days: studyDays, pace } = runup ?? {};
	return typeof studyDays === "number" && typeof pace === "number" ? { studyDays, pace } : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function handles(value: unknown, listed: ReadonlySet<string>): TopicHandle[] {
	return Array.isArray(value) ? value.filter((h): h is TopicHandle => typeof h === "string" && listed.has(h)) : [];
}

/** `plan`'s daily plan: each day's reviews and new topics, the handles the
 *  map lists; a day left with neither is dropped. Pure. */
export function plannedOf(plan: unknown, map: Pick<CourseMap, "topics">): PlannedDay[] {
	const days = record(courseEntry(plan)?.plan)?.days;
	if (!Array.isArray(days)) return [];
	const listed = new Set<string>(map.topics.map((t) => t.handle));
	return days.flatMap((value) => {
		const day = record(value);
		if (!day || typeof day.date !== "string" || !DAY.test(day.date)) return [];
		const planned = { date: day.date, reviews: handles(day.reviews, listed), new: handles(day.new, listed) };
		return planned.reviews.length + planned.new.length > 0 ? [planned] : [];
	});
}

/** `plan`'s `does_not_fit`: the path topics the plan cannot introduce
 *  before the exam. Pure. */
export function doesNotFitOf(plan: unknown, map: Pick<CourseMap, "topics">): TopicHandle[] {
	return handles(record(courseEntry(plan)?.plan)?.does_not_fit, new Set(map.topics.map((t) => t.handle)));
}

const TIME = /^\d{2}:\d{2}$/;

function windowOf(value: unknown): StudyWindow | null {
	const { start, end } = record(value) ?? {};
	return typeof start === "string" && typeof end === "string" && TIME.test(start) && TIME.test(end) ? { start, end } : null;
}

/** `plan`'s `journal.upcoming_schedule` as days ahead; empty when the
 *  Journal has none or could not be read. Pure. */
export function scheduleOf(plan: unknown): ScheduledDay[] {
	const upcoming = record(record(plan)?.journal)?.upcoming_schedule;
	if (!Array.isArray(upcoming)) return [];
	return upcoming.flatMap((entry) => {
		const day = record(entry);
		if (!day || typeof day.date !== "string") return [];
		const windows = (Array.isArray(day.study_windows) ? day.study_windows : []).map(windowOf).filter((w) => w !== null);
		return [{ date: day.date, off: day.is_off_day === true, windows }];
	});
}

export async function calendarRead(): Promise<CalendarListing> {
	const listing = await readCourses(CALENDAR_DAYS);
	if (!listing.available) return listing;
	const read = listing.read.flatMap((c) => (typeof c === "string" ? [] : [c]));
	return {
		available: true,
		courses: read.map(({ map, plan }) => ({
			...studyCourseOf(map, plan),
			runup: runupOf(plan),
			planned: plannedOf(plan, map),
			doesNotFit: doesNotFitOf(plan, map),
		})),
		failed: listing.read.filter((c): c is string => typeof c === "string"),
		schedule: read.map(({ plan }) => scheduleOf(plan)).find((days) => days.length > 0) ?? [],
	};
}
