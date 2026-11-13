/**
 * The calendar's read: every listed course as the study home reads it,
 * with the exam run-up's figures `plan` gives, and the study windows the
 * Journal schedules for the days ahead. Engine fields only: the app
 * invents no date.
 */

import type { TopicHandle } from "./course-map.ts";
import type { StudyCourse } from "./study.ts";

/** The exam run-up as `plan` reports it, inside its last three weeks:
 *  the days left that take new topics, and the topics not yet taught to
 *  cover on each of them. */
export interface CalendarRunup {
	studyDays: number;
	pace: number;
}

/** One day of the engine's daily plan: the reviews and the new topics it
 *  proposes, within the learner's budget. */
export interface PlannedDay {
	date: string;
	reviews: readonly TopicHandle[];
	new: readonly TopicHandle[];
}

export interface CalendarCourse extends StudyCourse {
	/** Null outside the run-up, or when no day is left for new topics. */
	runup: CalendarRunup | null;
	/** The daily plan, each day that proposes something, in date order. */
	planned: readonly PlannedDay[];
	/** Path topics the plan cannot introduce before the exam. */
	doesNotFit: readonly TopicHandle[];
}

/** One study window, "HH:MM" local. */
export interface StudyWindow {
	start: string;
	end: string;
}

/** One day ahead as the Journal schedules it: its study windows (lunch
 *  left out), or a day off. */
export interface ScheduledDay {
	date: string;
	off: boolean;
	windows: readonly StudyWindow[];
}

/** What GET /api/calendar answers. `schedule` is empty when the Journal
 *  has no schedule to read. A course whose read failed is named in
 *  `failed`. */
export type CalendarListing =
	| { available: true; courses: CalendarCourse[]; failed: string[]; schedule: ScheduledDay[] }
	| { available: false; reason: string };
