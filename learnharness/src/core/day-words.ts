/**
 * The plan's days in words for the tutor (round 3: it said "tomorrow's
 * eigenvalue review" for a review the plan put four days out, counting
 * from the day memory asks for it). Every planned day the course tools
 * return carries its words beside it, relative to the engine's study day,
 * so the tutor names a day by copying them and never counts one. Pure.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const at = (day: string) => new Date(`${day}T00:00:00Z`);

/** "Thursday 12 November". */
export function longDay(day: string): string {
	return LONG.format(at(day)).replace(",", "");
}

/** "Thu 12 Nov". */
export function shortDay(day: string): string {
	return SHORT.format(at(day)).replace(",", "");
}

/** A planned day against the study day: "today", "tomorrow, Monday 9
 *  November", "Thursday 12 November, in 4 days", "Sunday 22 November, in 14
 *  days". Always days, as the app counts every distance. */
export function plannedDayWords(day: string, today: string): string {
	const days = Math.round((at(day).getTime() - at(today).getTime()) / 86_400_000);
	if (days <= 0) return days === 0 ? "today" : `${longDay(day)}, ${-days === 1 ? "yesterday" : `${-days} days ago`}`;
	if (days === 1) return `tomorrow, ${longDay(day)}`;
	return `${longDay(day)}, in ${days} days`;
}

/** The engine's study day, as its clock reads it (`learning/clock.py`):
 *  the pinned `LEARNING_TODAY`, else the local calendar day. */
export function studyDay(env: Record<string, string | undefined> = process.env, now = new Date()): string {
	const pinned = env.LEARNING_TODAY;
	if (pinned && DAY.test(pinned)) return pinned;
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Now on the study day: the pinned `LEARNING_TODAY` at the time of day it
 *  is now, else now. What the app stamps a session's activity with, so the
 *  day it was studied is the day every surface and the engine call today. */
export function studyNow(env: Record<string, string | undefined> = process.env, now = new Date()): Date {
	const pinned = env.LEARNING_TODAY;
	if (!pinned || !DAY.test(pinned)) return now;
	const [year, month, day] = pinned.split("-").map(Number) as [number, number, number];
	const at = new Date(now);
	at.setFullYear(year, month - 1, day);
	return at;
}

/** The engine's JSON with `planned_words` beside every `planned` day and
 *  `starts_words` beside every `starts` day, relative to the output's own
 *  `today` when it has one, else `today`. */
export function withDayWords(json: unknown, today: string): unknown {
	const own = typeof json === "object" && json !== null && typeof (json as { today?: unknown }).today === "string" ? (json as { today: string }).today : today;
	const walk = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(walk);
		if (typeof value !== "object" || value === null) return value;
		const out: Record<string, unknown> = {};
		for (const [key, inner] of Object.entries(value)) {
			out[key] = walk(inner);
			if ((key === "planned" || key === "starts") && typeof inner === "string" && DAY.test(inner)) out[`${key}_words`] = plannedDayWords(inner, own);
		}
		return out;
	};
	return walk(json);
}
