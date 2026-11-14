import type { TopicHandle, TopicSignals } from "@/src/core";

/**
 * The app's one wording for where he stands on a topic and why it needs
 * him (Edo, 14 Nov 2026): the map, Home's rows, the sidebar, the course
 * page, the topic page and the calendar all say these, so none can drift.
 * Pure.
 */

/** How much of a topic's pie is filled, in quarters. */
export type Fill = 0 | 0.25 | 0.5 | 0.75 | 1;

/** Where he stands, one phrase per pie step. The words follow the pie, not
 *  the engine's level: a weak topic he could do on his own draws a 3/4 pie,
 *  so it says "Right with help". */
export const STANDING_WORDS: Record<Fill, string> = {
	0: "Not started",
	0.25: "Taught, not tried",
	0.5: "Tried, not right yet",
	0.75: "Right with help",
	1: "On your own",
};

/** A slip's words for each of the engine's signals but a mixed-up method,
 *  which names the method (`slipWords`). */
export const SLIP_WORDS = {
	repaired: "Fixed, check again later",
	lapsed: "Missed last time",
	gap: "Mistake to fix",
	confident: "Sure, but wrong",
	none: "Look again",
} as const;

/** Why the engine calls a topic weak, its first signal: a mistake he has
 *  answered right since, a miss after he had it, a diagnosed mistake, a
 *  method chosen in its place, a wrong answer he was sure of, else none of
 *  those. */
export function slipWords(signals: TopicSignals, titleOf: (handle: TopicHandle) => string): string {
	const { gap, lapsed, choiceErrors, confidentErrors, repaired } = signals;
	if (repaired) return SLIP_WORDS.repaired;
	if (lapsed) return SLIP_WORDS.lapsed;
	if (gap) return SLIP_WORDS.gap;
	const [method] = Object.keys(choiceErrors);
	if (method) return `Mixed up with ${titleOf(method as TopicHandle)}`;
	if (confidentErrors > 0) return SLIP_WORDS.confident;
	return SLIP_WORDS.none;
}

/** A review come due: "Due today", "3d overdue", "2w overdue". */
export function overdueWords(overdue: number): string {
	if (overdue <= 0) return "Due today";
	if (overdue < 7) return `${overdue}d overdue`;
	return `${Math.floor(overdue / 7)}w overdue`;
}

/** A review the engine has dated ahead, some days away: "Back in 5d",
 *  "Back in 3w", "Back in 2mo". */
export function returnWords(days: number): string {
	if (days < 14) return `Back in ${days}d`;
	if (days < 60) return `Back in ${Math.round(days / 7)}w`;
	return `Back in ${Math.round(days / 30)}mo`;
}

/** How much of a course he can do on his own, the topics the course's ring
 *  counts: "5 of 16 topics on your own", "No topics on your own yet", "All
 *  16 topics on your own". */
export function courseShareWords(solid: number, of: number): string {
	if (solid === 0) return "No topics on your own yet";
	if (solid >= of) return `All ${of} topics on your own`;
	return `${solid} of ${of} topics on your own`;
}

/** A folded list's last row: "Show the rest" when one press shows every
 *  hidden row, else "Show more". How many is left out: a bare number told
 *  him nothing (Edo, 13 Nov 2026). */
export function moreWords(hidden: number, page: number): string {
	return hidden <= page ? "Show the rest" : "Show more";
}
