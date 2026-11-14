import { currentArc, type ArcHandle, type ArcState, type CourseExam, type ExamGapReason, type CourseMap, type CourseMapTopic, type JobKind, type MarkHow, type MarkResult, type MarkRow, type RightAnswer, type StartsWhy, type TopicHandle, type TopicSignals, type UnreadableProblem } from "@/src/core";

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
 *  there. Right unaided only on the day it was taught says what is left, a
 *  check on another day, never a count: "once" read false after three
 *  unaided answers that day (round 5). */
export const RIGHT_WORDS: Record<RightAnswer, string> = {
	unaided: "Right on your own, check another day",
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
	// A gap with no wrong answer open: two right answers with help left
	// "still to check on your own" (round 6), never a mistake he made.
	check: "Check on your own",
	confident: "Sure, but wrong",
	none: "Look again",
} as const;

/** Which slip a topic shows: one per `SLIP_WORDS` entry, and a method
 *  he mixed it up with. Each has its own icon (`slip-icons.ts`). */
export type SlipKey = keyof typeof SLIP_WORDS | "mixed";

/** Why the engine calls a topic weak, its first signal: a mistake he has
 *  answered right on his own since, a miss after he had it, a diagnosed
 *  mistake, a method chosen in its place, a wrong answer he was sure of,
 *  else none of those. A repair made only with help is not shown fixed,
 *  since help may have carried it, and is still a mistake to fix: the
 *  signals under it describe answers before that right one, so "Not right
 *  last time" or "Sure, but wrong" would contradict it (round 5). A gap or
 *  a repair is a mistake only while a wrong answer is open (`mistake`);
 *  else it is what is left to check on his own (round 6). */
export function slipMark(signals: TopicSignals, titleOf: (handle: TopicHandle) => string): { key: SlipKey; words: string } {
	const { gap, lapsed, choiceErrors, confidentErrors, repaired, repairedWithHelp } = signals;
	const toFix = signals.mistake ? ({ key: "gap", words: SLIP_WORDS.gap } as const) : ({ key: "check", words: SLIP_WORDS.check } as const);
	if (repaired) return repairedWithHelp ? toFix : { key: "repaired", words: SLIP_WORDS.repaired };
	if (lapsed) return { key: "lapsed", words: SLIP_WORDS.lapsed };
	if (gap) return toFix;
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

/** How an attempt went (`markHow`), in the words the answer card and the
 *  topic page's Earlier both say: a prediction before its step was taught
 *  never counts; he gave up without an answer; help was given; or no help,
 *  a guess or a partly right answer included. */
export const MARK_HOW_WORDS: Record<MarkHow, string> = {
	predicted: "Prediction, not counted",
	gaveUp: "Gave up",
	withHelp: "With help",
	ownWork: "On your own",
};

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

/** A review the plan moved past the day memory asked for it, from when:
 *  "Due since 1 Oct" once that day has passed, else "Moved from 9 Nov", so
 *  a day the tutor named that a later review took never changes in
 *  silence (round 5); null for a review the plan does not hold. */
export function movedWords(review: CourseMapTopic["review"], today: string): string | null {
	if (review?.kind !== "scheduled" || !review.held) return null;
	return review.held.since < today ? `Due since ${shortDay(review.held.since)}` : `Moved from ${shortDay(review.held.since)}`;
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

/** "A", "A and B", "A, B and C". */
function listWords(names: readonly string[]): string {
	return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Why a topic's first lesson waits (the engine's `starts_after`): the
 *  courses whose new topics take the days before it. "After Probability's
 *  new topics", "After Probability's and Linear Algebra's new topics";
 *  null when it waits for none. */
export function startsAfterWords(courses: readonly string[] | undefined): string | null {
	if (!courses || courses.length === 0) return null;
	return `After ${listWords(courses.map((course) => `${course}'s`))} new topics`;
}

/** What the plan does for a course with no exam, in place of a bare "No
 *  exam day set" (round 5: Calculus' reviews waited weeks and its head
 *  said only that): its reviews wait for other courses' exams, whose final
 *  reviews come first, or for room on earlier days; else they come back
 *  when memory asks for them. Pure. */
export function noExamWords(topics: readonly Pick<CourseMapTopic, "review">[]): string {
	const held = topics.flatMap((t) => (t.review?.kind === "scheduled" && t.review.held ? [t.review.held] : []));
	const exams = [...new Set(held.flatMap((h) => (h.exam ? [h.exam] : [])))];
	if (exams.length > 0) return `No exam: reviews wait for your ${listWords(exams)} ${exams.length === 1 ? "exam" : "exams"}`;
	if (held.length > 0) return `No exam: reviews wait, ${HELD_WORDS.full.toLowerCase()}`;
	return "No exam: reviews come back when memory asks";
}

/** When a course he has not studied yet gives its first lesson and why
 *  then, the plan's day for its earliest start (round 5: a new course had
 *  nothing in Today and its first lesson 11 days out, with no word why):
 *  "First lesson today", "First lesson Thu 19 Nov, after Probability's new
 *  topics"; null when the plan starts none. Pure. */
export function firstLessonWords(topics: readonly Pick<CourseMapTopic, "starts" | "startsAfter">[], today: string): string | null {
	const first = topics.filter((t) => t.starts).sort((a, b) => a.starts!.localeCompare(b.starts!))[0];
	if (!first?.starts) return null;
	if (first.starts <= today) return "First lesson today";
	const after = startsAfterWords(first.startsAfter);
	const day = `First lesson ${SHORT_WEEKDAY.format(new Date(`${first.starts}T00:00:00Z`)).replace(",", "")}`;
	return after ? `${day}, ${after.charAt(0).toLowerCase()}${after.slice(1)}` : day;
}

const SHORT_WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Where an arc stands, in the engine's own states: no count, since the
 *  pie beside it draws the share. `taught` is a course that takes no
 *  questions, which never offers a check. */
export const ARC_STATE_WORDS: Record<ArcState, string> = {
	new: "Not started",
	learning: "In progress",
	ready: "Ready for its check",
	checked: "Check passed",
	taught: "All taught",
};

/** An arc the next exam does not examine whole (`examCovers`); an arc it
 *  examines whole says nothing. */
export const ARC_EXAM_WORDS = {
	part: "Partly on the exam",
	none: "Not on the exam",
} as const;

/** The course head's line under its first, when the exam's plan leaves
 *  topics out (`examGaps`: the engine's `does_not_fit` and `unreviewed`):
 *  why, in the engine's reasons (`EXAM_GAP_WHY`), then a way in. "Today",
 *  since a press starts it now. */
export const EXAM_GAP_WORDS = {
	start: "Start it today",
	review: "Review it today",
	startOne: "Start one today",
	ask: "Ask the tutor",
	/** Each topic in Start one today's menu: "Start Variance", "Review Rank". */
	startTopic: "Start",
	reviewTopic: "Review",
} as const;

/** Each engine reason (`ExamGapReason`) a topic is left out, in his
 *  words: for a topic with no room to start (`start`), and for a taught
 *  one the final review has no room for (`review`). */
export const EXAM_GAP_WHY: {
	start: Readonly<Partial<Record<ExamGapReason, string>>>;
	review: Readonly<Partial<Record<ExamGapReason, string>>>;
} = {
	start: {
		no_study_day: "No study day is left before the exam",
		not_ready: "What comes first won’t be solid before the exam",
		full: "Every study day before the exam is full at your pace",
	},
	review: {
		no_study_day: "No study day is left in the final review",
		too_late: "Starts too close to the exam for a review",
		full: "Every day of the final review is full at your pace",
	},
};

/** The taught topics the final review has no room for, standing alone
 *  (the calendar's "No room in it for" reads under its final review). */
export function finalReviewMissWords(titles: readonly string[]): string {
	return `No room in the final review for ${listWords(titles)}`;
}

/** The same, when the head's first line already names a topic with no
 *  room to start. */
export function examGapEitherWords(titles: readonly string[]): string {
	return `${finalReviewMissWords(titles)} either`;
}

/** His opening words in a lesson Ask the tutor starts, naming the topics. */
export function examGapAsk(titles: readonly string[]): string {
	return `My exam plan has no room for ${listWords(titles)}. How can I still fit ${titles.length === 1 ? "it" : "them"} in before the exam?`;
}

/** Why a topic the exam ahead leaves out (`exam.leavesOut`) starts when
 *  it does: "Not on the exam; after it" when the plan starts it after the
 *  exam, "Not on the exam" when it starts before, since nothing the exam
 *  examines waits. Null for a topic the exam examines, or with no exam
 *  ahead. Pure. */
export function leftOutWords(topic: Pick<CourseMapTopic, "handle" | "starts">, exam: Pick<CourseExam, "date" | "daysLeft" | "leavesOut"> | null): string | null {
	if (!exam || exam.daysLeft < 0 || !exam.leavesOut?.includes(topic.handle)) return null;
	return topic.starts && topic.starts > exam.date ? "Not on the exam; after it" : "Not on the exam";
}

/** What the exam's plan means for a topic it leaves out (`examGaps`), on
 *  the topic's own page, in the engine's reason (`exam.reasons`). */
export const EXAM_GAP_TOPIC_WORDS: {
	start: Readonly<Record<ExamGapReason | "none", string>>;
	review: Readonly<Record<ExamGapReason | "none", string>>;
} = {
	start: {
		none: "Not before the exam",
		no_study_day: "Not before the exam, no study day is left",
		not_ready: "Not before the exam, what it needs won’t be solid in time",
		full: "Not before the exam, every study day is full at your pace",
		too_late: "Not before the exam",
	},
	review: {
		none: "No review before the exam",
		no_study_day: "No review before the exam, no study day is left in the final review",
		not_ready: "No review before the exam",
		full: "No review before the exam, the final review is full at your pace",
		too_late: "No review before the exam, it starts too close to it",
	},
};

/** The words for `topic` when the exam ahead has no room to start it
 *  (`doesNotFit`) or to review it (`unreviewed`); null otherwise. Pure. */
export function examGapTopicWords(topic: Pick<CourseMapTopic, "handle">, exam: Pick<CourseExam, "daysLeft" | "doesNotFit" | "unreviewed" | "reasons"> | null): string | null {
	if (!exam || exam.daysLeft < 0) return null;
	const reason = exam.reasons?.[topic.handle] ?? "none";
	if (exam.doesNotFit?.includes(topic.handle)) return EXAM_GAP_TOPIC_WORDS.start[reason];
	if (exam.unreviewed?.includes(topic.handle)) return EXAM_GAP_TOPIC_WORDS.review[reason];
	return null;
}

/** The map's fields the words of a start read: its arcs' names and
 *  order, and where he is (`currentArc`). */
type StartsMap = Pick<CourseMap, "title" | "topics" | "arcs" | "current" | "currentArc">;

/** Whether `arc` comes before the arc he is in (`currentArc`), in the
 *  course's arc order: the plan goes back to it. */
function behindHere(arc: ArcHandle, map: StartsMap): boolean {
	const order = map.arcs?.map((a) => a.handle) ?? [];
	const here = currentArc(map);
	return here !== null && order.indexOf(arc) >= 0 && order.indexOf(arc) < order.indexOf(here);
}

/** Why an untaught topic starts when the plan starts it, in his course's
 *  names: "Next in Matrices"; "Back to Matrices, earlier in the course"
 *  when the arc he is in comes after it, so "You are here" in a later arc
 *  never reads against "Next in" an earlier one (round 6); "After
 *  Expectation, which it needs"; "After Separable equations, so the two
 *  methods stay apart"; "Early, from Orthogonality, while earlier topics
 *  wait on Rank"; "Early, from Orthogonality, to keep pace with the exam".
 *  A course without arcs says "Next in Linear Algebra" and "Early, ahead
 *  of its place". Pure. */
export function startsWhyWords(why: StartsWhy, map: StartsMap): string {
	const titles = (handles: readonly TopicHandle[]) => listWords(handles.map((h) => map.topics.find((t) => t.handle === h)?.title ?? h));
	const arc = why.arc && (map.arcs?.find((a) => a.handle === why.arc)?.title ?? why.arc);
	if (why.kind === "early") {
		const early = arc ? `Early, from ${arc}` : "Early, ahead of its place";
		if (why.exam) return `${early}, to keep pace with the exam`;
		return why.waitingOn.length > 0 ? `${early}, while earlier topics wait on ${titles(why.waitingOn)}` : early;
	}
	if (why.kind === "after" && (why.needs.length > 0 || why.partners.length > 0)) {
		const needs = why.needs.length > 0 ? `${titles(why.needs)}, which it needs` : null;
		const apart = why.partners.length > 0 ? `${titles(why.partners)}, so the ${why.partners.length === 1 ? "two methods stay" : "methods stay"} apart` : null;
		return `After ${[needs, apart].filter(Boolean).join(", and ")}`;
	}
	if (why.arc && behindHere(why.arc, map)) return `Back to ${arc}, earlier in the course`;
	return `Next in ${arc ?? map.title}`;
}

/** Whether a start's reason tells him anything its planned day does not:
 *  every reason but "next" in a course without arcs, which would only say
 *  "Next in Linear Algebra" beside the course's own name. Pure. */
export function startsWhyTells(why: StartsWhy): boolean {
	if (why.arc !== undefined || why.kind === "early") return true;
	return why.kind === "after" && (why.needs.length > 0 || why.partners.length > 0);
}

/** `startsWhyWords` cut to fit a row's reason beside its icon, where the
 *  topic page keeps the whole sentence: "Next in Matrices"; "Back to
 *  Matrices"; "After Expectation"; "After Separable equations"; "Early,
 *  from Orthogonality" ("Early, ahead of its place" without arcs). Pure. */
export function startsWhyShort(why: StartsWhy, map: StartsMap): string {
	if (why.kind === "early") return startsWhyWords({ ...why, waitingOn: [], exam: false }, map);
	if (why.kind === "after" && (why.needs.length > 0 || why.partners.length > 0)) {
		const handles = why.needs.length > 0 ? why.needs : why.partners;
		return `After ${listWords(handles.map((h) => map.topics.find((t) => t.handle === h)?.title ?? h))}`;
	}
	const arc = why.arc && behindHere(why.arc, map) ? map.arcs?.find((a) => a.handle === why.arc)?.title : undefined;
	return arc ? `Back to ${arc}` : startsWhyWords(why, map);
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
	unreadableNotSaved: "What you answer here isn't saved until it can be read again.",
	courseDeleted: "This course was deleted. Its lessons stay as history.",
	startLesson: "Start a new lesson",
} as const;

/** An answer's mark as the record keeps it (Edo, 14 Nov 2026): the
 *  result, whether it counted as his own or as helped, the confidence
 *  recorded, and a dispute. */
export const MARK_WORDS = {
	result: { correct: "Right", partial: "Partly right", incorrect: "Not right" } satisfies Record<MarkResult, string>,
	sure: { guess: "Guessing", confident: "Confident" } satisfies Record<NonNullable<MarkRow["sure"]>, string>,
	disputed: "Disputed",
	dispute: "Dispute",
	disputeTitle: "Dispute this mark",
	disputeLine: "Say what's wrong, or pick the mark you think is right. The tutor looks at your answer again.",
	disputePlaceholder: "What's wrong with the mark?",
	disputeSend: "Send to the tutor",
	youDisputed: "You disputed the mark",
	youThink: "You think",
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
export function backgroundWorkWords(kind: JobKind | "mapping" | "grouping" | "digest" | "unknown", title: string): string {
	switch (kind) {
		case "mapping":
			return `Building the topic map of ${title}`;
		case "grouping":
			return `Grouping the topics of ${title} into arcs`;
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
 *  hidden row, as the sidebar's shelves and the course page's groups both
 *  do, else "Show more". How many is left out: a bare number told him
 *  nothing (Edo, 13 Nov 2026). */
export function moreWords(hidden: number, page: number): string {
	return hidden <= page ? "Show the rest" : "Show more";
}
/** How ready he is for the exam, in the engine's own sorting (its
 *  `standing`): every part solid, not yet, or not all of it fits. "Not
 *  ready yet in" leads the bubbles of the arcs that are not. */
export const READY_WORDS = {
	ready: "Ready for the exam",
	notYet: "Not ready for the exam yet",
	notYetIn: "Not ready yet in",
} as const;

/** Where one arc stands for the exam, on its line beside its name, so a
 *  few words: never "ready", which its check's state already says. */
export const PART_WORDS = {
	ready: "Solid for the exam",
	notYet: "Not solid yet",
	short: "Won't all fit",
} as const;

/** A course without arcs, not ready: the topics not yet solid, else those
 *  still to start. "Not yet solid for the exam: Basis and Rank". */
export function notReadyWords(kind: "notYet" | "toStart", names: string): string {
	return kind === "notYet" ? `Not yet solid for the exam: ${names}` : `Still to start before the exam: ${names}`;
}

/** The mistakes still open in a course: the list's name, the head's press,
 *  a mistake made with help, and a list with nothing in it. */
export const MISTAKE_WORDS = {
	title: "Mistakes to fix",
	press: "Mistakes",
	helped: "With help",
	none: "No mistakes to fix",
} as const;
