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
 *  November", "Thursday 12 November", "Wednesday 4 November, yesterday".
 *  The day itself, never a count of days (round 14, m9: a close said "on
 *  Tuesday 10 November, in 2 days"). */
export function plannedDayWords(day: string, today: string): string {
	const days = Math.round((at(day).getTime() - at(today).getTime()) / 86_400_000);
	if (days === 0) return "today";
	if (days === 1) return `tomorrow, ${longDay(day)}`;
	return days === -1 ? `${longDay(day)}, yesterday` : longDay(day);
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
 *  day it was studied is the day every surface and the engine call today.
 *  A pinned day's clock runs `LEARNING_CLOCK_SHIFT` seconds ahead of the
 *  machine's, as the engine's does (`learning/clock.py`), so a simulated
 *  day keeps its own time of day whenever it is played. */
export function studyNow(env: Record<string, string | undefined> = process.env, now = new Date()): Date {
	const pinned = env.LEARNING_TODAY;
	if (!pinned || !DAY.test(pinned)) return now;
	const [year, month, day] = pinned.split("-").map(Number) as [number, number, number];
	const at = new Date(now.getTime() + Number(env.LEARNING_CLOCK_SHIFT || 0) * 1000);
	at.setFullYear(year, month - 1, day);
	return at;
}

/** The engine's JSON with `planned_words` beside every `planned` day and
 *  `starts_words` beside every `starts` day, relative to the output's own
 *  `today` when it has one, else `today`, and `from_words` beside the day a
 *  `moved` day was told for. The start of a lesson he began (`starts_why`
 *  `begun`) is the day it continues, so its words are `continues_words`,
 *  as the app says "Lesson continues". */
const begunStart = (topic: object): boolean => ((topic as { starts_why?: { kind?: unknown } }).starts_why)?.kind === "begun";

export function withDayWords(json: unknown, today: string): unknown {
	const own = typeof json === "object" && json !== null && typeof (json as { today?: unknown }).today === "string" ? (json as { today: string }).today : today;
	const walk = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(walk);
		if (typeof value !== "object" || value === null) return value;
		const out: Record<string, unknown> = {};
		for (const [key, inner] of Object.entries(value)) {
			out[key] = walk(inner);
			if ((key === "planned" || key === "starts") && typeof inner === "string" && DAY.test(inner)) out[`${key === "starts" && begunStart(value) ? "continues" : key}_words`] = plannedDayWords(inner, own);
			if (key === "moved" && typeof inner === "object" && inner !== null && typeof (inner as { from?: unknown }).from === "string") out.moved = { ...(inner as object), from_words: longDay((inner as { from: string }).from) };
		}
		return out;
	};
	return walk(json);
}
