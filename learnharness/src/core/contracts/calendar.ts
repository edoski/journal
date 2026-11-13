/**
 * The calendar's read: every listed course as the study home reads it,
 * with the exam run-up's figures `plan` gives, and the study windows the
 * Journal schedules for the days ahead. Engine fields only: the app
 * invents no date.
 */

import type { StudyCourse } from "./study.ts";

/** The exam run-up as `plan` reports it, inside its last three weeks:
 *  the days with a study window until a week before the exam, and the
 *  topics not yet taught to cover on each of them. */
export interface CalendarRunup {
	studyDays: number;
	pace: number;
}

export interface CalendarCourse extends StudyCourse {
	/** Null outside the run-up, or when the Journal schedules no study day. */
	runup: CalendarRunup | null;
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
