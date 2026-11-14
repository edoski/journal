import type { TopicHandle, TopicSignals, UnreadableProblem } from "@/src/core";

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

/** The lesson's words for what just happened to his work (round 2, 14 Nov
 *  2026): a reply below the fold, a reply that never came, a draft another
 *  window overtook, stopping for the night, and a course whose record
 *  can't be read. One form each, wherever it shows. */
export const LESSON_WORDS = {
	newReply: "New reply",
	stoppedBeforeReply: "The tutor stopped before replying.",
	tryAgain: "Try again",
	answeredElsewhere: "Answered in another window. What you typed here is in the box below.",
	doneTonight: "Done for tonight",
	leftForTonight: "Left for next time",
	unreadableCourse: "Couldn't read this course's record",
} as const;

/** What stops a course's record being read, after
 *  `LESSON_WORDS.unreadableCourse`, in a student's words. */
export const UNREADABLE_WORDS: Record<UnreadableProblem, string> = {
	denied: "The app isn't allowed to open its files.",
	damaged: "Its file is damaged.",
	unreadable: "Its file can't be opened.",
};
