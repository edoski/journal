import type { CourseMapTopic, JobKind, MarkResult, MarkRow, MarkSure, RightAnswer, TopicHandle, TopicSignals, UnreadableProblem } from "@/src/core";

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
	// Not "Missed": beside an overdue review he read that as a review he
	// skipped (round 3). A lapse is an answer that was not right.
	lapsed: "Not right last time",
	gap: "Mistake to fix",
	confident: "Sure, but wrong",
	none: "Look again",
} as const;

/** Which slip a topic shows: one per `SLIP_WORDS` entry, and a method
 *  he mixed it up with. Each has its own icon (`slip-icons.ts`). */
export type SlipKey = keyof typeof SLIP_WORDS | "mixed";

/** Why the engine calls a topic weak, its first signal: a mistake he has
 *  answered right on his own since, a miss after he had it, a diagnosed
 *  mistake, a method chosen in its place, a wrong answer he was sure of,
 *  else none of those. A repair made only with help is not shown fixed:
 *  help may have carried it, so the signal under it shows. */
export function slipMark(signals: TopicSignals, titleOf: (handle: TopicHandle) => string): { key: SlipKey; words: string } {
	const { gap, lapsed, choiceErrors, confidentErrors, repaired, repairedWithHelp } = signals;
	if (repaired && !repairedWithHelp) return { key: "repaired", words: SLIP_WORDS.repaired };
	if (lapsed) return { key: "lapsed", words: SLIP_WORDS.lapsed };
	if (gap) return { key: "gap", words: SLIP_WORDS.gap };
	const [method] = Object.keys(choiceErrors);
	if (method) return { key: "mixed", words: `Mixed up with ${titleOf(method as TopicHandle)}` };
	if (confidentErrors > 0) return { key: "confident", words: SLIP_WORDS.confident };
	return { key: "none", words: SLIP_WORDS.none };
}

/** The slip's words alone (`slipMark`). */
export function slipWords(signals: TopicSignals, titleOf: (handle: TopicHandle) => string): string {
	return slipMark(signals, titleOf).words;
}

/** A lapse on a line about another topic, naming the lapsed one: "Not
 *  right last time: Chain rule". */
export function lapsedOnWords(title: string): string {
	return `${SLIP_WORDS.lapsed}: ${title}`;
}

/** How one scored attempt went, in a topic's history: right, partly right,
 *  or not right (wrong, or given up). */
export const ATTEMPT_WORDS = {
	right: "Right",
	partly: "Partly right",
	wrong: "Not right",
} as const;

/*
 * Every distance in time counts whole days, one scheme wherever it shows:
 * "3d ago", "13d ago", "45d ago", never weeks or months (round 4: search
 * put "13d ago" beside "2w ago" and "4w ago", where 13 days read as more
 * recent than 14 by a different unit). `distanceWords` already said days.
 */

/** A review come due: "Due today", "3d overdue", "16d overdue". */
export function overdueWords(overdue: number): string {
	if (overdue <= 0) return "Due today";
	return `${overdue}d overdue`;
}

/** Where unfinished work holding a topic was left, by when, never by the
 *  tutor's step: "Left off today", "Left off yesterday", "Left off 3d
 *  ago", "Left off 20d ago"; "Unfinished" when no day is known. */
export function leftOffWords(days: number | null): string {
	if (days === null) return "Unfinished";
	if (days <= 0) return "Left off today";
	if (days === 1) return "Left off yesterday";
	return `Left off ${days}d ago`;
}

/** A review the engine has dated ahead, some days away: "Back in 5d",
 *  "Back in 21d". */
export function returnWords(days: number): string {
	return `Back in ${days}d`;
}

/** Some days ago in a trailing column: "Today", "Yesterday", "3d ago",
 *  "40d ago". */
export function agoWords(days: number): string {
	if (days <= 0) return "Today";
	if (days === 1) return "Yesterday";
	return `${days}d ago`;
}

/** When he last studied something, as a phrase: "Studied today",
 *  "Studied yesterday", "Studied 3 days ago", "Studied 40 days ago". */
export function studiedDaysWords(days: number): string {
	if (days <= 0) return "Studied today";
	if (days === 1) return "Studied yesterday";
	return `Studied ${days} days ago`;
}

/** What a topic page's Now row offers on a topic not started: its first
 *  lesson, since the head already says "Not started" (round 3 found it
 *  twice). */
export const FIRST_LESSON = "First lesson";

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

/** What a session reads while the tutor writes in it, the one word for
 *  that state wherever it shows: the sidebar's card and shelf, Home's row,
 *  the topic page and the course page (round 4: the sidebar said "Working"
 *  where Home said "Tutor writing"). */
export const TUTOR_WRITING = "Tutor writing";

/** The lesson's words for what just happened to his work (round 2, 14 Nov
 *  2026): a reply below the fold, a reply that never came (he stopped it,
 *  or the app lost it), a connection that dropped mid-reply, a draft
 *  another window overtook, stopping for the day, a problem he skipped,
 *  and a course whose record can't be read. One form each, wherever it
 *  shows. */
export const LESSON_WORDS = {
	newReply: "New reply",
	skippedQuestion: "Skipped",
	stoppedBeforeReply: "The tutor stopped before replying.",
	youStoppedReply: "You stopped the tutor before it replied.",
	tryAgain: "Try again",
	connectionDropped: "The connection dropped before the tutor finished replying.",
	tryAgainPlaceholder: "Press Enter to try again, or write something new.",
	answeredElsewhere: "Answered in another window. What you typed here is in the box below.",
	doneTonight: "Done for today",
	leftForTonight: "Left for next time",
	skippedProblem: "You skipped this problem.",
	unreadableCourse: "Couldn't read this course's record",
	courseDeleted: "This course was deleted. Its lessons stay as history.",
	startLesson: "Start a new lesson",
} as const;

/** What a lesson's top bar says it is doing: asking its opening questions
 *  (the same word as their label), planning, teaching, practice, or
 *  stopped for the day. A lesson is never called a quiz (round 3). */
export const PHASE_WORDS = {
	probe: "Recall",
	plan: "Planning",
	teach: "Teaching",
	practice: "Practice",
	done: LESSON_WORDS.doneTonight,
} as const;

/** A question's label on its card and folded bar, by what it asks: a
 *  check of what was just taught, a prediction before it, a recall of
 *  what he knows, else a plain question. */
export const QUESTION_WORDS = {
	check: "Check",
	predict: "Prediction",
	recall: "Recall",
	question: "Question",
} as const;

/** An answer's mark as the record keeps it (Edo, 14 Nov 2026): the
 *  result, whether it counted as his own or as helped, the confidence
 *  recorded, and a dispute. */
export const MARK_WORDS = {
	result: { correct: "Right", partial: "Partly right", incorrect: "Not right" } satisfies Record<MarkResult, string>,
	sure: { guess: "Guessing", neutral: "Neutral", confident: "Confident" } satisfies Record<MarkSure, string>,
	ownWork: "On your own",
	withHelp: "With help",
	countedHelped: "Counted as helped",
	disputed: "Disputed",
	dispute: "Dispute",
	disputeTitle: "Dispute this mark",
	disputeLine: "Say what's wrong, or pick the mark you think is right. The tutor looks at your answer again.",
	disputePlaceholder: "What's wrong with the mark?",
	disputeSend: "Send to the tutor",
	youDisputed: "You disputed the mark",
	youThink: "You think",
} as const;

/** Whether an attempt counted as his own or as helped, from the engine's
 *  grade and the help it records: a right guess, an unsure answer or a
 *  partly right one with no help counts as helped all the same. */
export function countedWords(row: Pick<MarkRow, "grade" | "helped">): string {
	if (row.helped) return MARK_WORDS.withHelp;
	return row.grade === "helped" ? MARK_WORDS.countedHelped : MARK_WORDS.ownWork;
}

/** The lesson's mark for a helper he stopped, one sentence per kind;
 *  `stopped` when the kind is unknown. */
export const STOPPED_WORDS: Record<JobKind | "unknown", string> = {
	research: "Research stopped by you",
	demo: "Demo stopped by you",
	visual: "Figure stopped by you",
	pdf: "PDF reading stopped by you",
	unknown: "Stopped by you",
};

/** Esc's confirm, in his words: skip the question or problem waiting on
 *  him, or stop the tutor's reply. `alsoStops` follows a skip made while
 *  the tutor is still writing. */
export const STOP_WORDS = {
	turn: { title: "Stop the tutor's reply?", line: "What it has written so far stays.", action: "Stop" },
	question: { title: "Skip this question?", line: "The tutor goes on without your answer.", action: "Skip" },
	problem: { title: "Skip this problem?", line: "The tutor moves on, and the solution stays hidden.", action: "Skip" },
	alsoStops: "The tutor's reply stops too.",
} as const;

/** What stops a course's record being read, after
 *  `LESSON_WORDS.unreadableCourse`, in a student's words. */
export const UNREADABLE_WORDS: Record<UnreadableProblem, string> = {
	denied: "The app isn't allowed to open its files.",
	damaged: "Its file is damaged.",
	unreadable: "Its file can't be opened.",
};

/** What the sidebar's foot calls the work the app does on its own (a
 *  figure, a course's topic map, what a finished lesson taught), one name
 *  wherever it is mentioned (round 3: "Activity" against "Working in the
 *  background"). */
export const BACKGROUND_WORDS = {
	name: "Background work",
	followIt: "You can follow it under Background work in the sidebar and start studying now.",
} as const;

/** One piece of background work in full: what it does, for which lesson or
 *  course. */
export function backgroundWorkWords(kind: JobKind | "mapping" | "digest" | "unknown", title: string): string {
	switch (kind) {
		case "mapping":
			return `Building the topic map of ${title}`;
		case "digest":
			return `Saving what you learned in ${title}`;
		case "visual":
			return `Drawing a figure for ${title}`;
		case "research":
			return `Looking things up for ${title}`;
		case "demo":
			return `Building a demo for ${title}`;
		case "pdf":
			return `Reading a PDF for ${title}`;
		default:
			return `Working on ${title}`;
	}
}

/** How much of a course he can do on his own, in words beside the ring
 *  that draws the share: no count, since the app shows none (Edo's
 *  rulings; round 2 flagged "5 of 16"). "Most" is more than half. */
export function courseShareWords(solid: number, of: number): string {
	if (solid === 0) return "No topics on your own yet";
	if (solid >= of) return "Every topic on your own";
	return solid * 2 > of ? "Most topics on your own" : "Some topics on your own";
}

/** The free field under a choice question, which asks for nothing in
 *  particular: it may be his goal, not an answer to justify (round 3:
 *  "Why this answer?" under a goal-picking question). */
export const CHOICE_NOTE = "Anything to add?";

/** A folded list's last row: "Show the rest" when one press shows every
 *  hidden row, else "Show more". How many is left out: a bare number told
 *  him nothing (Edo, 13 Nov 2026). */
export function moreWords(hidden: number, page: number): string {
	return hidden <= page ? "Show the rest" : "Show more";
}

/** The lesson's details panel, in his words: which tutor, how much room
 *  the lesson has before the tutor sums it up, and what it has cost. */
export const DETAIL_WORDS = {
	tutor: "Tutor",
	room: "Room left",
	cost: "Cost so far",
	unmeasured: "Not measured yet",
	plenty: "Plenty",
	filling: "Over half used. When it fills, the tutor sums up the lesson so far",
	plan: "Included in your Claude plan",
} as const;

/** How much room the lesson has before the tutor sums it up (`used` of
 *  `room`, both in the model's own units, never shown): plenty until half
 *  is used, since half is the one split that needs no tuning, then a
 *  warning of what happens when it fills. */
export function roomWords(used: number | null, room: number): string {
	if (used === null) return DETAIL_WORDS.unmeasured;
	return used * 2 < room ? DETAIL_WORDS.plenty : DETAIL_WORDS.filling;
}
