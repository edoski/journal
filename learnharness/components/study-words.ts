import { currentArc, type ArcHandle, type ArcState, type CourseExam, type ExamGapReason, type CourseMap, type CourseMapTopic, type JobKind, type MarkHow, type MarkResult, type MarkRow, movedWhy, type RightAnswer, type StartsWhy, type TopicHandle, type TopicMoved, type TopicSignals, type UnreadableProblem } from "@/src/core";

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

/** A topic he is losing (`slipsNow`): the warning ink's words, as every
 *  other state has its own (Edo, 15 Nov 2026), with the slip beside it
 *  saying why (`slipMark`). */
export const SLIPPING_WORDS = "Slipping";

/** A topic he cannot yet do on his own, by how he answered it since his
 *  newest answer that was not right (the engine's `right`): the 3/4 pie's
 *  words when help is what kept it there. Right unaided only on the day it was taught says what is left, a
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
 *  words, except on a topic not yet solid, which says how he answered it
 *  since his newest answer that was not right (the engine's `right`), so
 *  an unaided or a partial answer never reads "Right with help", and right
 *  answers after a review day's wrong first try never read "Tried, not
 *  right yet" (round 7). With no right answer since that wrong one (no
 *  `right`), it says so: "Not right last time", never "Right with help"
 *  (round 8: Eigen read "Right with help" after a Show me). Right on his
 *  own drops "check another day" once that day has come, beside the review
 *  due (round 8). `attempted` with no right answer since keeps its pie's
 *  words. A weak topic he could do on his own says how he answered it
 *  since its miss: right on his own, or with help when help repaired it.
 *  A topic that slips says `SLIPPING_WORDS` instead (`standingOf`). Pure. */
export function standingWords(fill: Fill, topic: Pick<CourseMapTopic, "level" | "right"> & Partial<Pick<CourseMapTopic, "review" | "signals">>): string {
	const learning = topic.level === "assisted" || topic.level === "attempted";
	const unaided = () => (topic.review?.kind === "due" ? RIGHT_ON_YOUR_OWN : RIGHT_WORDS.unaided);
	if (learning && topic.right) return topic.right === "unaided" ? unaided() : RIGHT_WORDS[topic.right];
	// No right answer since his newest wrong one, on a topic still being learned.
	if (topic.level === "assisted") return WRONG_LAST_WORDS;
	// A weak topic he could do on his own that does not slip (`slipsNow`):
	// its miss answered right since, with help or on his own, or a check left.
	if (fill === 0.75 && !learning) return topic.signals?.mistake ? WRONG_LAST_WORDS : topic.signals?.repairedWithHelp ? RIGHT_WORDS.helped : unaided();
	return STANDING_WORDS[fill];
}

/** A topic whose newest answer that counts was not right, and none right
 *  since. */
const WRONG_LAST_WORDS = "Not right last time";

/** Right on his own, on the day its check has come. */
const RIGHT_ON_YOUR_OWN = "Right on your own";

/** A slip's words for each of the engine's signals but a mixed-up method,
 *  which names the method (`slipWords`). */
export const SLIP_WORDS = {
	// Not "Fixed, check again later": beside "Slipping", which the engine
	// keeps until a later day's answer on his own, it read as its opposite
	// (round 10, 2 m3).
	repaired: "Check again another day",
	// Not "Missed": beside an overdue review he read that as a review he
	// skipped (round 3). A lapse is an answer that was not right.
	lapsed: WRONG_LAST_WORDS,
	gap: "Mistake to fix",
	// A gap with no wrong answer open: two right answers with help left
	// "still to check on your own" (round 6), never a mistake he made.
	check: "Check on your own",
	confident: "Sure, but wrong",
} as const;

/** Which slip a topic shows: one per `SLIP_WORDS` entry, and a method
 *  he mixed it up with. Each has its own icon (`slip-icons.ts`). */
export type SlipKey = keyof typeof SLIP_WORDS | "mixed";

/** Why the engine calls a topic weak, its first signal: a mistake he has
 *  answered right on his own since; else, with no wrong answer open (the
 *  engine's `mistake`, closed by any right answer), what is left to check
 *  on his own; else a miss after he had it, a diagnosed mistake, a method
 *  chosen in its place, a wrong answer he was sure of, else the mistake to
 *  fix. The signals that describe a wrong answer show only while one is
 *  open, so a right last try never reads "Not right last time" (round 7),
 *  and a repair made only with help is not shown fixed, since help may
 *  have carried it (round 5). */
export function slipMark(signals: TopicSignals, titleOf: (handle: TopicHandle) => string): { key: SlipKey; words: string } {
	const { gap, lapsed, choiceErrors, confidentErrors, repaired, repairedWithHelp, mistake } = signals;
	if (repaired && !repairedWithHelp) return { key: "repaired", words: SLIP_WORDS.repaired };
	if (!mistake) return { key: "check", words: SLIP_WORDS.check };
	if (lapsed) return { key: "lapsed", words: SLIP_WORDS.lapsed };
	if (gap) return { key: "gap", words: SLIP_WORDS.gap };
	const [method] = Object.keys(choiceErrors);
	if (method) return { key: "mixed", words: `Mixed up with ${titleOf(method as TopicHandle)}` };
	if (confidentErrors > 0) return { key: "confident", words: SLIP_WORDS.confident };
	return { key: "gap", words: SLIP_WORDS.gap };
}

/** The slip's words alone (`slipMark`). */
export function slipWords(signals: TopicSignals, titleOf: (handle: TopicHandle) => string): string {
	return slipMark(signals, titleOf).words;
}

/** Whether a topic's slip is a lapse (`slipMark`), the one rule every
 *  line that names a lapse reads, so none says "Not right last time" once
 *  a right answer closed it (round 7). Pure. */
export function lapsedNow(signals: TopicSignals): boolean {
	return slipMark(signals, (handle) => handle).key === "lapsed";
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
 *  never counts; he gave up without an answer; help was given; a right
 *  answer the engine doubts is not his own yet, as `RIGHT_WORDS.uncertain`
 *  says of the topic; or no help, a guess or a partly right answer
 *  included. */
export const MARK_HOW_WORDS: Record<MarkHow, string> = {
	predicted: "Prediction, not counted",
	gaveUp: "Gave up",
	withHelp: "With help",
	unconfirmed: "Not yet confirmed",
	ownWork: "On your own",
};

/*
 * A time in the past is named by its day, never counted (round 9, 2 m5:
 * "Due since 5 Nov", "Left off 6 Nov" and "Studied 4 Nov" made him count
 * back): "today", "yesterday", else the day, "3 Nov", as "Due since 3 Nov"
 * and "Back Tue 10 Nov" already said. `today` is the engine's study day.
 */

/** The engine day some days before `today`. */
function dayBefore(today: string, days: number): string {
	const d = new Date(`${today}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString().slice(0, 10);
}

/** The day some days before `today`: "today", "yesterday", else "3 Nov". */
function pastDay(days: number, today: string): string {
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	return shortDay(dayBefore(today, days));
}

/** A review come due: "Due today", else since the day it fell due, "Due
 *  since 3 Nov". */
export function overdueWords(overdue: number, today: string): string {
	if (overdue <= 0) return "Due today";
	return `Due since ${shortDay(dayBefore(today, overdue))}`;
}

/** Where unfinished work holding a topic was left, by when, never by the
 *  tutor's step: "Left off today", "Left off yesterday", "Left off 6 Nov";
 *  "Unfinished" when no day is known. */
export function leftOffWords(days: number | null, today: string): string {
	if (days === null) return "Unfinished";
	return `Left off ${pastDay(days, today)}`;
}

/** A review the engine has dated ahead, by its day, never a count of
 *  days (round 8: "Back in 2d" where the tutor said Tuesday 10 November):
 *  "Back Tue 10 Nov". */
export function returnWords(day: string): string {
	return `Back ${weekdayWords(day)}`;
}

/** "Tue 10 Nov". */
export function weekdayWords(day: string): string {
	return SHORT_WEEKDAY.format(new Date(`${day}T00:00:00Z`)).replace(",", "");
}

/** A past day in a trailing column: "Today", "Yesterday", "26 Oct". */
export function agoWords(days: number, today: string): string {
	const day = pastDay(days, today);
	return day.charAt(0).toUpperCase() + day.slice(1);
}

/** When he last studied something, as a phrase, labelled so beside a
 *  line's reason it never reads as one (round 8): "Studied today",
 *  "Studied yesterday", "Studied 4 Nov". */
export function studiedDaysWords(days: number, today: string): string {
	return `Studied ${pastDay(days, today)}`;
}

/** What a topic page's Now row offers on a topic not started: its first
 *  lesson, since the head already says "Not started" (round 3 found it
 *  twice). */
export const FIRST_LESSON = "First lesson";

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** "1 Oct". */
export const shortDay = (day: string) => SHORT_DAY.format(new Date(`${day}T00:00:00Z`));

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

/** Why a review waits, as a page or the calendar says it: only when
 *  another course's exam took its day (`HELD_WORDS.exam`). That earlier
 *  days are full explains a gap from memory's day, a day he was never told,
 *  so a row says nothing of it (round 11: "Earlier days are full" under
 *  a review read as noise). */
export function heldExamWords(review: CourseMapTopic["review"]): string | null {
	return review?.kind === "scheduled" && review.held?.exam ? HELD_WORDS.exam(review.held.exam) : null;
}

/** A day that moved, from when: one he was told ("Moved from 10 Nov after
 *  your Probability study today", round 7: a told day moved in silence),
 *  else a review the plan holds past a day memory asked for that has
 *  passed, "Due since 1 Oct"; null otherwise. Memory's day still ahead was
 *  never a day he was told, so nothing moved "from" it (round 8: "Moved
 *  from 11 Nov" named a day he never heard). */
export function movedWords(review: CourseMapTopic["review"], today: string, told?: TopicMoved): string | null {
	if (told) return `Moved from ${shortDay(told.from)}${movedWhy(told, today, shortDay)}`;
	if (review?.kind !== "scheduled" || !review.held) return null;
	return review.held.since < today ? `Due since ${shortDay(review.held.since)}` : null;
}

/** A review that is due: "Due today", "Due since 5 Nov"; one the plan holds
 *  past a day memory asked for already says since when, so a review weeks
 *  late never reads as spacing, and the day the plan brings it back, "Due
 *  since 1 Oct, back 3 Dec" (round 8: Calculus' rows gave no return day);
 *  any other dated review "Back in 5d". `today` is the engine's day. */
export function reviewWords(review: NonNullable<CourseMapTopic["review"]>, today: string): string {
	if (review.kind === "due") return overdueWords(review.overdue, today);
	if (review.held && review.held.since < today) return `Due since ${shortDay(review.held.since)}, back ${shortDay(review.date)}`;
	return returnWords(review.date);
}

/** A review by its one day, for a row too narrow for the sentence
 *  (`reviewWords` stays its hint): "Due 6 Nov" for "Due since 6 Nov"; a
 *  review the plan holds past memory's day by the day it comes back,
 *  "Back 20 Nov" for "Due since 6 Nov, back 20 Nov" (round 11, 2 n9: "Due
 *  6 Nov" read as overdue while the map said back 20 Nov); "Due today" and
 *  any other dated review as `reviewWords`. */
export function shortReviewWords(review: NonNullable<CourseMapTopic["review"]>, today: string): string {
	if (review.kind === "due" && review.overdue > 0) return `Due ${shortDay(dayBefore(today, review.overdue))}`;
	if (review.kind === "scheduled" && review.held && review.held.since < today) return `Back ${shortDay(review.date)}`;
	return reviewWords(review, today);
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
	/** The menu of the other topics he can take up today, beside the pick. */
	another: "Or another",
	ask: "Ask the tutor",
	/** Each topic in Start one today's menu: "Start Variance", "Review Rank". */
	startTopic: "Start",
	reviewTopic: "Review",
} as const;

/** A topic the exam's plan leaves out, by title, with the engine's reason
 *  (`exam.reasons`); a topic with no reason reads as `full`. */
export interface ExamGapTopic {
	title: string;
	reason?: ExamGapReason;
}

/** "it" or "they" for some topics' clause, by their number. */
const startsWord = (titles: readonly string[]) => (titles.length === 1 ? "starts" : "start");

/**
 * Why the exam's plan leaves topics out, in at most two sentences (round 8:
 * five sentences, "full at your pace" twice, and "Starts too close to the
 * exam for a review" naming no topic): one for the topics with no room to
 * start (`start`), which the head's first line already names, and one for
 * the taught topics the final review has no room for (`review`), each
 * reason said once. A clause names its topics when the first line does not
 * (the review's topics under a first line about starts), or when its list
 * has more than one reason; a topic that starts too late is always named.
 * Your pace is said once: a final review full at your pace is the same
 * cause as study days full at your pace. Null with nothing left out. Pure.
 */
export function examGapWhyWords(start: readonly ExamGapTopic[], review: readonly ExamGapTopic[]): string | null {
	const by = (topics: readonly ExamGapTopic[], reason: ExamGapReason) => topics.filter((t) => (t.reason ?? "full") === reason).map((t) => t.title);
	const reasons = (topics: readonly ExamGapTopic[]) => new Set(topics.map((t) => t.reason ?? "full")).size;
	const sentence = (clauses: readonly string[]) => (clauses.length > 0 ? `${clauses.join(", and ").replace(/^./, (c) => c.toUpperCase())}.` : null);
	const name = start.length > 1 && reasons(start) > 1;
	const startFull = by(start, "full");
	const notReady = by(start, "not_ready");
	const first = sentence([
		...(by(start, "no_study_day").length > 0 ? ["no study day is left before the exam"] : []),
		...(startFull.length > 0 ? ["your pace fills every study day before the exam"] : []),
		...(notReady.length > 0 ? [name ? `what ${listWords(notReady)} ${notReady.length === 1 ? "needs" : "need"} won’t be solid in time` : "what comes first won’t be solid in time"] : []),
	]);
	const paceSaid = startFull.length > 0;
	const named = start.length > 0 || reasons(review) > 1;
	const full = by(review, "full");
	const noDay = by(review, "no_study_day");
	const late = by(review, "too_late");
	const second = sentence([
		...(noDay.length > 0 ? [named ? `no study day is left in the final review for ${listWords(noDay)}` : "no study day is left in the final review"] : []),
		...(full.length > 0 ? [named ? `the final review has no room for ${listWords(full)}${paceSaid ? "" : " at your pace"}` : paceSaid ? "the final review is full too" : "your pace fills every day of the final review"] : []),
		...(late.length > 0 ? [`${listWords(late)} ${startsWord(late)} too close to the exam for a review`] : []),
	]);
	const both = [first, second].filter((s): s is string => s !== null);
	return both.length > 0 ? both.join(" ") : null;
}

/** The pick among the topics he can take up today, as its press says it:
 *  "Start Expectation and linearity today", "Review Binomial distribution
 *  today". */
export function examGapPickWords(starts: boolean, title: string): string {
	return `${starts ? EXAM_GAP_WORDS.startTopic : EXAM_GAP_WORDS.reviewTopic} ${title} today`;
}

/** The taught topics the final review leaves out, a line per reason,
 *  under the calendar's "Final review" line: "No room in it for Kernel",
 *  "Poisson starts too close to the exam for a review", "No study day left
 *  in it for Geometric". Each reason in the head's words (`examGapWhyWords`),
 *  so the two never disagree (round 9: "No room in it for Poisson" beside
 *  the head's "starts too close to the exam"). Pure. */
export function finalReviewGapWords(topics: readonly ExamGapTopic[]): string[] {
	const by = (reason: ExamGapReason) => topics.filter((t) => (t.reason ?? "full") === reason).map((t) => t.title);
	const [full, late, noDay] = [by("full"), by("too_late"), by("no_study_day")];
	return [
		...(full.length > 0 ? [`No room in it for ${listWords(full)}`] : []),
		...(late.length > 0 ? [`${listWords(late)} ${startsWord(late)} too close to the exam for a review`] : []),
		...(noDay.length > 0 ? [`No study day left in it for ${listWords(noDay)}`] : []),
	];
}

/** The final review as he can place it: "the final review from 13 Nov"
 *  while it is still ahead, so a topic it has no room for reads as
 *  reviewed before it, never as not reviewed at all (round 11 integration:
 *  "No room in the final review for Binomial" beside "Review Binomial
 *  today", which the plan does before the final review); "the final
 *  review" once it is under way. Pure. */
function finalReviewName(exam: Pick<CourseExam, "finalReview">, today: string): string {
	return exam.finalReview && exam.finalReview > today ? `the final review from ${shortDay(exam.finalReview)}` : "the final review";
}

/** The taught topics the final review has no room for, standing alone
 *  (the calendar's "No room in it for" reads under its final review). */
export function finalReviewMissWords(titles: readonly string[], exam: Pick<CourseExam, "finalReview">, today: string): string {
	return `No room in ${finalReviewName(exam, today)} for ${listWords(titles)}`;
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
 *  the topic's own page, in the engine's reason (`exam.reasons`). A
 *  review's words follow the final review's name (`finalReviewName`). */
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
	// The final review has no slot for it, whatever reviews come before
	// it: "No review before the exam" read false beside "Review Wed 11 Nov"
	// (round 9, 2 M1). The words match `finalReviewMissWords`.
	review: {
		none: "",
		no_study_day: ", no study day is left in it",
		not_ready: "",
		full: " at your pace",
		too_late: ", it starts too close to the exam",
	},
};

/** The words for `topic` when the exam ahead has no room to start it
 *  (`doesNotFit`) or to review it (`unreviewed`); null otherwise. Pure. */
export function examGapTopicWords(topic: Pick<CourseMapTopic, "handle">, exam: Pick<CourseExam, "daysLeft" | "doesNotFit" | "unreviewed" | "reasons" | "finalReview"> | null, today: string): string | null {
	if (!exam || exam.daysLeft < 0) return null;
	const reason = exam.reasons?.[topic.handle] ?? "none";
	if (exam.doesNotFit?.includes(topic.handle)) return EXAM_GAP_TOPIC_WORDS.start[reason];
	if (exam.unreviewed?.includes(topic.handle)) return `No room in ${finalReviewName(exam, today)}${EXAM_GAP_TOPIC_WORDS.review[reason]}`;
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
	youStoppedMidReply: "You stopped the tutor mid-reply.",
	tryAgain: "Try again",
	connectionDropped: "The connection dropped before the tutor finished replying.",
	tryAgainPlaceholder: "Press Enter to try again, or write something new.",
	/** The box after Done for today left a question open: his next message
	 *  answers it (round 10, 3 m2). */
	leftQuestionPlaceholder: "Your answer to the question above, or ask anything",
	answeredElsewhere: "Answered in another window. What you typed here is in the box below.",
	answeredElsewhereOpen: "Answered in another window. Press Esc to see what you typed here.",
	hintElsewhere: "Another window asked for a hint. What you typed here comes back when the hint is done.",
	askedElsewhere: "Another window asked the tutor something. What you typed here comes back when the tutor asks the question again.",
	/** A question or problem opened over words still in the message box
	 *  (round 11, 4 minor 2: a message kept while the app was down sat
	 *  hidden there after the restart). */
	messageKept: "Your unsent message is kept. Press Esc to see it.",
	doneTonight: "Done for today",
	leftForTonight: "Left for next time",
	skippedProblem: "You skipped this problem.",
	unreadableCourse: "Couldn't read this course's record",
	unreadableNotSaved: "What you answer here isn't saved until it can be read again.",
	courseDeleted: "This course was deleted. Its lessons stay as history.",
	courseDeletedKept: "What you wrote here is in the new lesson box.",
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
	disputeLine: "Say what's wrong, or pick the mark or how it should count. The tutor looks at your answer again.",
	disputePlaceholder: "What's wrong with the mark?",
	disputeSend: "Send to the tutor",
	youDisputed: "You disputed the mark",
	youThink: "You think",
} as const;

/** His dispute's stamp in the transcript: "You disputed the mark", then
 *  what he picked, the mark and how it should count, "You think: Right,
 *  On your own". One rule for the lesson's row and practice's bubble
 *  (round 8: practice's stamp dropped a help pick). Pure. */
export function disputeStampWords(dispute: { proposed?: MarkResult; proposedHow?: MarkHow & ("ownWork" | "withHelp") }): string {
	const picked = [dispute.proposed && MARK_WORDS.result[dispute.proposed], dispute.proposedHow && MARK_HOW_WORDS[dispute.proposedHow]].filter(Boolean);
	return picked.length > 0 ? `${MARK_WORDS.youDisputed} · ${MARK_WORDS.youThink}: ${picked.join(", ")}` : MARK_WORDS.youDisputed;
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

/** Show me's confirm: it gives the question or problem up, which no undo
 *  can take back once the answer is on screen (round 8: Show me gave up
 *  at once, with no confirm). */
export const SHOW_WORDS = {
	question: { title: "Show the answer?", line: "This question counts as given up.", action: "Show me" },
	problem: { title: "Show the solution?", line: "This problem counts as given up.", action: "Show me" },
} as const;

/** What stops a course's record being read, after
 *  `LESSON_WORDS.unreadableCourse`, in a student's words. */
export const UNREADABLE_WORDS: Record<UnreadableProblem, string> = {
	denied: "macOS won't let the app open its files: Get Info on the course folder in Finder shows who can read it.",
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
	/** After the least ready topics, the press that shows them all. */
	rest: "and the rest",
} as const;

/** A course without arcs, not ready: the topics not yet solid, else those
 *  still to start. "Not yet solid for the exam: Basis and Rank". */
export function notReadyWords(kind: "notYet" | "toStart", names: string): string {
	return `${notReadyHeading(kind)}: ${names}`;
}

/** The same list's name, heading every topic it means. */
export function notReadyHeading(kind: "notYet" | "toStart"): string {
	return kind === "notYet" ? "Not yet solid for the exam" : "Still to start before the exam";
}

/** The mistakes still open in a course: the list's name, the head's press,
 *  a mistake made with help, and a list with nothing in it. */
export const MISTAKE_WORDS = {
	title: "Mistakes to fix",
	press: "Mistakes",
	helped: "With help",
	none: "No mistakes to fix",
} as const;
