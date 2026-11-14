/**
 * The calendar's server seam: the study home's read of every course, with
 * `plan` asked up to the course's exam and at least six weeks ahead, the
 * most a month view shows, so it also gives the daily plan for those days,
 * the final review's start, the weekdays he studies and the Journal's study
 * windows. The study windows are the vault's, the same for every course, so
 * the first plan that lists them is read.
 */

import { CALENDAR_DAYS, type CalendarListing, type PlannedDay, type ScheduledDay, type StudyWindow } from "../core/contracts/calendar.ts";
import type { CourseSummary } from "../core/contracts/course.ts";
import type { CourseMap, TopicHandle } from "../core/contracts/course-map.ts";
import { readCourses, studyCourseOf } from "./study.ts";

/** The engine refuses a longer plan (`learning/planning.py`, MAX_DAYS). */
const ENGINE_MAX_DAYS = 366;

/** The days to ask `plan` for one course: up to its exam, so its whole
 *  road shows, and at least the month view's six weeks. Pure. */
export function planDays(course: Pick<CourseSummary, "exam">): number {
	return Math.min(ENGINE_MAX_DAYS, Math.max(CALENDAR_DAYS, course.exam?.daysLeft ?? 0));
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function courseEntry(plan: unknown): Record<string, unknown> | null {
	const courses = record(plan)?.courses;
	return record(Array.isArray(courses) ? courses[0] : null);
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** The weekdays the engine has learned he studies, Monday 0, or null when
 *  `plan` gives none. Pure. */
export function studyWeekdaysOf(plan: unknown): Set<number> | null {
	const days = record(record(plan)?.capacity)?.study_days;
	if (!Array.isArray(days)) return null;
	return new Set(days.flatMap((day) => (typeof day === "string" && WEEKDAYS.includes(day) ? [WEEKDAYS.indexOf(day)] : [])));
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

/** The final review's first day: the exam day less `plan`'s
 *  `final_review_days`; null without both. Pure. */
export function finalReviewOf(plan: unknown, exam: CourseMap["exam"]): string | null {
	const days = record(courseEntry(plan)?.plan)?.final_review_days;
	if (!exam || typeof days !== "number" || !DAY.test(exam.date)) return null;
	return addDays(exam.date, -days);
}

const TIME = /^\d{2}:\d{2}$/;

function windowOf(value: unknown): StudyWindow | null {
	const { start, end } = record(value) ?? {};
	return typeof start === "string" && typeof end === "string" && TIME.test(start) && TIME.test(end) ? { start, end } : null;
}

function weekday(day: string): number {
	return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function addDays(day: string, days: number): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/** The days ahead: off on a weekday the engine has learned he does not
 *  study, else the Journal's windows (`journal.upcoming_schedule`) or its
 *  day off. Without a Journal schedule, the engine's study days alone;
 *  empty when neither says anything. Pure. */
export function scheduleOf(plan: unknown): ScheduledDay[] {
	const studies = studyWeekdaysOf(plan);
	const upcoming = record(record(plan)?.journal)?.upcoming_schedule;
	const journal = new Map<string, { off: boolean; windows: StudyWindow[] }>();
	for (const entry of Array.isArray(upcoming) ? upcoming : []) {
		const day = record(entry);
		if (!day || typeof day.date !== "string") continue;
		const windows = (Array.isArray(day.study_windows) ? day.study_windows : []).map(windowOf).filter((w) => w !== null);
		journal.set(day.date, { off: day.is_off_day === true, windows });
	}
	const today = record(plan)?.today;
	const dates =
		journal.size > 0 ? [...journal.keys()] : studies && typeof today === "string" ? Array.from({ length: CALENDAR_DAYS }, (_, n) => addDays(today, n)) : [];
	return dates.map((date) => {
		const scheduled = journal.get(date);
		const off = studies ? !studies.has(weekday(date)) : (scheduled?.off ?? false);
		return { date, off, windows: off ? [] : (scheduled?.windows ?? []) };
	});
}

export async function calendarRead(): Promise<CalendarListing> {
	const listing = await readCourses(planDays);
	if (!listing.available) return listing;
	const { read, failed } = listing;
	return {
		available: true,
		courses: read.map(({ map, plan }) => ({
			...studyCourseOf(map, plan),
			planned: plannedOf(plan, map),
			doesNotFit: doesNotFitOf(plan, map),
			finalReview: finalReviewOf(plan, map.exam),
		})),
		failed,
		schedule: read.map(({ plan }) => scheduleOf(plan)).find((days) => days.length > 0) ?? [],
	};
}
