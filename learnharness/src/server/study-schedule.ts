/**
 * The days he studies, from `plan`'s output: the weekdays the engine has
 * learned he studies, and the Journal's study windows for each day ahead
 * (`journal.upcoming_schedule`). The calendar draws them; Home's read
 * gives today's windows, the hours the Mac app's morning notice keeps to,
 * and on a day off his usual ones (the DEFAULT row): he studies daily.
 */

import { CALENDAR_DAYS, type ScheduledDay, type StudyWindow } from "../core/contracts/calendar.ts";

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** The weekdays the engine has learned he studies, Monday 0, or null when
 *  `plan` gives none. Pure. */
export function studyWeekdaysOf(plan: unknown): Set<number> | null {
	const days = record(record(plan)?.capacity)?.study_days;
	if (!Array.isArray(days)) return null;
	return new Set(days.flatMap((day) => (typeof day === "string" && WEEKDAYS.includes(day) ? [WEEKDAYS.indexOf(day)] : [])));
}

const TIME = /^\d{2}:\d{2}$/;

function windowOf(value: unknown): StudyWindow | null {
	const { start, end } = record(value) ?? {};
	return typeof start === "string" && typeof end === "string" && TIME.test(start) && TIME.test(end) ? { start, end } : null;
}

/** His usual study windows, the Journal's DEFAULT row
 *  (`journal.usual_study_windows`); empty without a Journal. Pure. */
export function usualHoursOf(plan: unknown): StudyWindow[] {
	const usual = record(record(plan)?.journal)?.usual_study_windows;
	return (Array.isArray(usual) ? usual : []).map(windowOf).filter((w) => w !== null);
}

function weekday(day: string): number {
	return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function addDays(day: string, days: number): string {
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
		const journalOff = scheduled?.off ?? false;
		const off = studies ? !studies.has(weekday(date)) : journalOff;
		return { date, off, journalOff, windows: off ? [] : (scheduled?.windows ?? []) };
	});
}

