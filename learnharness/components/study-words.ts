import type { CourseMapTopic, RightAnswer, TopicHandle, TopicSignals } from "@/src/core";

/**
 * The app's one wording for where he stands on a topic and why it needs
 * him (Edo, 14 Nov 2026): the map, Home's rows, the sidebar, the course
 * page, the topic page and the calendar all say these, so none can drift.
 * Pure.
 */

/** How much of a topic's pie is filled, in quarters. */
export type Fill = 0 | 0.25 | 0.5 | 0.75 | 1;

/** Where he stands, one phrase per pie step, when the step says what
 *  happened (`standingWords`). */
export const STANDING_WORDS: Record<Fill, string> = {
	0: "Not started",
	0.25: "Taught, not tried",
	0.5: "Tried, not right yet",
	0.75: "Right with help",
	1: "On your own",
};

/** A topic he cannot yet do on his own, by how he has best answered it
 *  (the engine's `right`): the 3/4 pie's words when help is what kept it
 *  there. */
export const RIGHT_WORDS: Record<RightAnswer, string> = {
	unaided: "Right on your own once",
	helped: STANDING_WORDS[0.75],
	guess: "Right, but a guess",
	uncertain: "Right, not yet confirmed",
	partial: "Partly right",
};

/** Where he stands in words true to the engine's record: the pie step's
 *  words, except at the `assisted` level, which says how he has best
 *  answered the topic, so an unaided or a partial answer never reads
 *  "Right with help". A weak topic he could do on his own keeps its 3/4
 *  pie's words. Pure. */
export function standingWords(fill: Fill, topic: Pick<CourseMapTopic, "level" | "right">): string {
	return topic.level === "assisted" ? RIGHT_WORDS[topic.right ?? "helped"] : STANDING_WORDS[fill];
}

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
