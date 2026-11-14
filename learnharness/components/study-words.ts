import type { CourseMapTopic, JobKind, RightAnswer, TopicHandle, TopicSignals, UnreadableProblem } from "@/src/core";

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

/** Where unfinished work holding a topic was left, by when, never by the
 *  tutor's step: "Left off today", "Left off yesterday", "Left off 3d
 *  ago", "Left off 2w ago"; "Unfinished" when no day is known. */
export function leftOffWords(days: number | null): string {
	if (days === null) return "Unfinished";
	if (days <= 0) return "Left off today";
	if (days === 1) return "Left off yesterday";
	if (days < 14) return `Left off ${days}d ago`;
	if (days < 60) return `Left off ${Math.floor(days / 7)}w ago`;
	return `Left off ${Math.floor(days / 30)}mo ago`;
}

/** A review the engine has dated ahead, some days away: "Back in 5d",
 *  "Back in 3w", "Back in 2mo". */
export function returnWords(days: number): string {
	if (days < 14) return `Back in ${days}d`;
	if (days < 60) return `Back in ${Math.round(days / 7)}w`;
	return `Back in ${Math.round(days / 30)}mo`;
}

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** "1 Oct". */
const shortDay = (day: string) => SHORT_DAY.format(new Date(`${day}T00:00:00Z`));

/** Why a review waits past the day memory asks for it (the engine's
 *  `held`): another course's final review came first, or the days before
 *  its planned day are full. Never "your exams" when its own exam is the
 *  one it misses. */
export const HELD_WORDS = {
	exam: (course: string) => `Waits for your ${course} exam`,
	full: "Earlier days are full",
} as const;

/** The words for a review the plan holds back (`HELD_WORDS`); null for one
 *  it does not. */
export function heldWords(review: CourseMapTopic["review"]): string | null {
	if (review?.kind !== "scheduled" || !review.held) return null;
	return review.held.exam ? HELD_WORDS.exam(review.held.exam) : HELD_WORDS.full;
}

/** A review that is due: "Due today", "3d overdue"; one the plan holds
 *  past a day memory asked for already says since when, "Due since 1 Oct",
 *  so a review weeks late never reads as spacing; any other dated review
 *  "Back in 5d". `today` is the engine's day. */
export function reviewWords(review: NonNullable<CourseMapTopic["review"]>, today: string): string {
	if (review.kind === "due") return overdueWords(review.overdue);
	if (review.held && review.held.since < today) return `Due since ${shortDay(review.held.since)}`;
	return returnWords(Math.max(1, daysBetween(today, review.date)));
}

/** Why a topic's first lesson waits (the engine's `starts_after`): the
 *  courses whose new topics take the days before it. "After Probability's
 *  new topics", "After Probability's and Linear Algebra's new topics";
 *  null when it waits for none. */
export function startsAfterWords(courses: readonly string[] | undefined): string | null {
	if (!courses || courses.length === 0) return null;
	const names = courses.map((course) => `${course}'s`);
	const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
	return `After ${list} new topics`;
}

/** How far a day is from the engine's, one form wherever a distance shows
 *  (an exam, a planned review): "Today", "Tomorrow", "In 18 days",
 *  "Yesterday", "3 days ago". Always days, never rounded to weeks, so the
 *  same exam reads the same on the course page and in the calendar. */
export function distanceWords(day: string, today: string): string {
	const days = daysBetween(today, day);
	if (days === 0) return "Today";
	if (days === 1) return "Tomorrow";
	if (days === -1) return "Yesterday";
	return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/** Whole days from `from` to `to`, both "YYYY-MM-DD". */
function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
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
	doneTonight: "Done for today",
	leftForTonight: "Left for next time",
	unreadableCourse: "Couldn't read this course's record",
} as const;

/** The lesson's mark for a helper he stopped, one sentence per kind;
 *  `stopped` when the kind is unknown. */
export const STOPPED_WORDS: Record<JobKind | "unknown", string> = {
	research: "Research stopped by you",
	demo: "Demo stopped by you",
	visual: "Figure stopped by you",
	pdf: "PDF reading stopped by you",
	unknown: "Stopped by you",
};

/** What stops a course's record being read, after
 *  `LESSON_WORDS.unreadableCourse`, in a student's words. */
export const UNREADABLE_WORDS: Record<UnreadableProblem, string> = {
	denied: "The app isn't allowed to open its files.",
	damaged: "Its file is damaged.",
	unreadable: "Its file can't be opened.",
};

/** How much of a course he can do on his own, in words beside the ring
 *  that draws the share: no count, since the app shows none (Edo's
 *  rulings; round 2 flagged "5 of 16"). "Most" is more than half. */
export function courseShareWords(solid: number, of: number): string {
	if (solid === 0) return "No topics on your own yet";
	if (solid >= of) return "Every topic on your own";
	return solid * 2 > of ? "Most topics on your own" : "Some topics on your own";
}

/** A folded list's last row: "Show the rest" when one press shows every
 *  hidden row, else "Show more". How many is left out: a bare number told
 *  him nothing (Edo, 13 Nov 2026). */
export function moreWords(hidden: number, page: number): string {
	return hidden <= page ? "Show the rest" : "Show more";
}
