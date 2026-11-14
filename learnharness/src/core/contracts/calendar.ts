/**
 * The calendar's read: every listed course as the study home reads it,
 * with the daily plan and the final review's start `plan` gives, and the
 * days ahead as he studies them. Engine fields only: the app
 * invents no date.
 */

import type { UnreadableCourse } from "./course.ts";
import type { TopicHandle } from "./course-map.ts";
import type { StudyCourse } from "./study.ts";

/** How many days ahead the calendar asks `plan` for at least: the six
 *  weeks a month view can show. */
export const CALENDAR_DAYS = 42;

/** One day of the engine's daily plan: the reviews and the new topics it
 *  proposes, as much as he gets through on that weekday. */
export interface PlannedDay {
	date: string;
	reviews: readonly TopicHandle[];
	new: readonly TopicHandle[];
}

export interface CalendarCourse extends StudyCourse {
	/** The daily plan, each day that proposes something, in date order. */
	planned: readonly PlannedDay[];
	/** Path topics the plan cannot introduce before the exam. */
	doesNotFit: readonly TopicHandle[];
	/** The day the final review before the exam starts, as the plan's
	 *  `final_review_days` places it; null without an exam. */
	finalReview: string | null;
}

/** One study window, "HH:MM" local. */
export interface StudyWindow {
	start: string;
	end: string;
}

/** One day ahead: a day off when the engine has learned that he does not
 *  study on that weekday (`plan`'s `capacity.study_days`; the Journal's day
 *  off when the engine says nothing), else the Journal's study windows
 *  (lunch left out). `journalOff` says the Journal rests the day: on a
 *  day that is not `off`, his record shows he studies that weekday all the
 *  same, so the plan holds work there. */
export interface ScheduledDay {
	date: string;
	off: boolean;
	journalOff: boolean;
	windows: readonly StudyWindow[];
}

/** What GET /api/calendar answers. `schedule` is empty when the Journal
 *  has no schedule to read. A course whose read failed is named in
 *  `failed`. */
export type CalendarListing =
	| { available: true; courses: CalendarCourse[]; failed: UnreadableCourse[]; schedule: ScheduledDay[] }
	| { available: false; reason: string };
