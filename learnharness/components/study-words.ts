import { currentArc, type ArcHandle, type ArcState, type CourseExam, type ExamGapReason, type CourseMap, type CourseMapTopic, type JobKind, type MarkHow, type MarkResult, type MarkRow, movedWhy, type RightAnswer, type StartsWhy, type TopicHandle, type TopicMoved, type TopicSignals, titleList, type UnreadableProblem } from "@/src/core";

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
 *  since its miss: with help when help repaired it. A topic the engine
 *  calls weak never reads right on his own: the engine's check is still
 *  to come, "Check again another day", or "Check on your own" once its
 *  review is due (round 20, m4).
 *  A topic that slips says `SLIPPING_WORDS` instead (`standingOf`). Pure. */
export function standingWords(fill: Fill, topic: Pick<CourseMapTopic, "level" | "right"> & Partial<Pick<CourseMapTopic, "review" | "signals" | "tasks" | "weak">>): string {
	if (lessonBegun(topic)) return LESSON_BEGUN;
	const learning = topic.level === "assisted" || topic.level === "attempted";
	// Right on his own on a topic the engine calls weak is the engine's check still to come, never "Right on your own":
	// it stays weak until a later day's answer on his own, and its weakness holds back what needs it (round 20, m4:
	// Binomial read "Right on your own, check another day" while the engine held it weak and held Poisson back).
	const unaided = () => (topic.weak ? (topic.review?.kind === "due" ? SLIP_WORDS.check : SLIP_WORDS.repaired) : topic.review?.kind === "due" ? RIGHT_ON_YOUR_OWN : RIGHT_WORDS.unaided);
	if (learning && topic.right) return topic.right === "unaided" ? unaided() : RIGHT_WORDS[topic.right];
	// No right answer since his newest wrong one, on a topic still being learned.
	if (topic.level === "assisted") return WRONG_LAST_WORDS;
	// A weak topic he could do on his own that does not slip (`slipsNow`):
	// its miss answered right since, with help or on his own, or a check left.
	if (fill === 0.75 && !learning) return topic.signals?.mistake ? WRONG_LAST_WORDS : topic.signals?.repairedWithHelp ? RIGHT_WORDS.helped : unaided();
	return STANDING_WORDS[fill];
}

/** A topic not taught yet that an open task holds: a lesson he began,
 *  which the plan carries on (the engine's `begun`), never "Not started"
 *  (round 12, 1 D3: "Poisson distribution, Not started · Left off 10 Nov"
 *  after two Poisson lessons). Pure. */
export function lessonBegun(topic: Pick<CourseMapTopic, "level"> & Partial<Pick<CourseMapTopic, "tasks">>): boolean {
	return topic.level === "new" && (topic.tasks?.length ?? 0) > 0;
}

/** Where he stands on a lesson he began (`lessonBegun`). */
export const LESSON_BEGUN = "Lesson in progress";

/** What the plan dates for a lesson he began: the day it goes on, as a
 *  topic page's Scheduled line says it in place of `FIRST_LESSON`. */
export const LESSON_GOES_ON = "Lesson continues";

/** A topic whose newest answer that counts was not right, and none right
 *  since. */
const WRONG_LAST_WORDS = "Not right last time";

/** Right on his own, on the day its check has come, and a map card's
 *  short standing for it any day. */
export const RIGHT_ON_YOUR_OWN = "Right on your own";

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
 * "Due 5 Nov", "Left off 6 Nov" and "Studied 4 Nov" made him count
 * back): "today", "yesterday", else the day, "3 Nov", as "Due 3 Nov"
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

/** A review come due: "Due today", else the day it fell due, "Due 3 Nov",
 *  never "Due since", which with its icon left a sidebar card no room for
 *  its course's name (round 16, Edo's ruling of 18 Nov 2026). */
export function overdueWords(overdue: number, today: string): string {
	if (overdue <= 0) return "Due today";
	return dueWords(dayBefore(today, overdue));
}

/** A review due since a day already past: "Due 3 Nov". */
function dueWords(day: string): string {
	return `Due ${shortDay(day)}`;
}

/** Where unfinished work holding a topic was left, by when, never by the
 *  tutor's step: "Left off today", else its day, "Left off 6 Nov", never
 *  "yesterday", which left a sidebar card no room for its course's name
 *  (round 16, m4); "Unfinished" when no day is known. */
export function leftOffWords(days: number | null, today: string): string {
	if (days === null) return "Unfinished";
	return `Left off ${days <= 0 ? "today" : shortDay(dayBefore(today, days))}`;
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
 *  another course's exam took its day (`HELD_WORDS.exam`), never the
 *  topic's own `course` (round 20, m2: "Waits for your Probability exam" on
 *  a Probability topic). That earlier days are full explains a gap from
 *  memory's day, a day he was never told, so a row says nothing of it
 *  (round 11: "Earlier days are full" under a review read as noise). */
export function heldExamWords(review: CourseMapTopic["review"], course: string): string | null {
	const exam = review?.kind === "scheduled" ? review.held?.exam : null;
	return exam && exam !== course ? HELD_WORDS.exam(exam) : null;
}

/** A day he was told that moved, from when ("Moved from 10 Nov after
 *  your Probability study today", round 7: a told day moved in silence);
 *  null otherwise. Memory's day was never a day he was told, passed or
 *  ahead, so nothing moved "from" it and no row names it beside the day
 *  the plan gives (round 8: "Moved from 11 Nov" named a day he never
 *  heard; round 19, m2: RV's Scheduled row read "Review · Mon 9 Nov" over
 *  "Due 7 Nov" while its course row said "Back Mon 9 Nov"). */
export function movedWords(told: TopicMoved, today: string): string {
	return `Moved from ${shortDay(told.from)}${movedWhy(told, today, shortDay)}`;
}

/** A review that is due: "Due today", "Due 5 Nov"; any review the plan
 *  has a day for, one it holds past a day memory asked for included, the
 *  day it comes back, "Back Mon 16 Nov": what will happen, never the day
 *  memory asked for beside it (round 18, m1: "Due 6 Nov, back 16 Nov" on
 *  Uniform distribution said nothing he could act on; the hint says why
 *  it waits, `heldWords`). `today` is the engine's day. */
export function reviewWords(review: NonNullable<CourseMapTopic["review"]>, today: string): string {
	if (review.kind === "due") return overdueWords(review.overdue, today);
	return returnWords(review.date);
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
	/** The readiness answer's list of the topics left out that the head's line and the why do not name, behind its
	 *  press (round 17, m6; round 18, m7). */
	which: "Which topics",
	/** "Or another"'s groups: the plan's own for today, then the topics it leaves out (round 17, m6). */
	planned: "Planned today",
	leftOut: "Left out before the exam",
	/** The menu of the other topics he can take up today, beside the pick. */
	another: "Or another",
	/** Where that menu folds every way but the pick, which it marks (round 18, m6: 17 options with none marked). */
	more: "More",
	/** A topic he began, whose press picks its session or task up (round 12, 1 D5). */
	continue: "Continue it today",
	ask: "Ask the tutor",
} as const;

/** What a press on a topic or a Today line does: resume a session that
 *  waits on him (`open`: one the tutor is writing in), review the topic,
 *  continue a task or a lesson he began, start a topic, or study it again. */
export type PressKind = "resume" | "open" | "review" | "continue" | "start" | "study";

const PRESS_WORDS = { resume: "Resume", open: "Resume", review: "Review", continue: "Continue", start: "Start", study: "Study" } as const;

/** The press's word. */
export type PressWord = (typeof PRESS_WORDS)[PressKind];

/** The one word a press says, on every surface (the topic page's Now, the
 *  course page's Now, the sidebar's hover action, the calendar, the exam's
 *  ways in): a session he picks up reads Resume whether it waits on him or
 *  the tutor is writing in it (audit 17 Nov 2026, finding 2: the topic page
 *  said Open where the course page said Resume). Pure. */
export function pressWord(kind: PressKind): PressWord {
	return PRESS_WORDS[kind];
}

/** A topic the exam's plan leaves out, by title, with the engine's reason
 *  (`exam.reasons`); a topic with no reason is left out for none the
 *  engine names, and no words give it one (round 13, 1 n4: "your pace
 *  fills every day of the final review" while two of its days had room). */
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
 * cause as study days full at your pace. With `names` false it names no
 * topic but one that starts too late, the one consequence alone, for the
 * readiness answer, whose list is behind Which topics (round 17, m6: a
 * 90-word paragraph of 11 topics on the exam eve; round 18, m7: "One
 * starts too close to the exam", one what?). Null with nothing left out.
 * Pure.
 */
export function examGapWhyWords(start: readonly ExamGapTopic[], review: readonly ExamGapTopic[], names = true): string | null {
	const by = (topics: readonly ExamGapTopic[], reason: ExamGapReason) => topics.filter((t) => t.reason === reason).map((t) => t.title);
	const reasons = (topics: readonly ExamGapTopic[]) => new Set(topics.map((t) => t.reason)).size;
	const sentence = (clauses: readonly string[]) => (clauses.length > 0 ? `${clauses.join(", and ").replace(/^./, (c) => c.toUpperCase())}.` : null);
	const name = names && start.length > 1 && reasons(start) > 1;
	const startFull = by(start, "full");
	const notReady = by(start, "not_ready");
	const first = sentence([
		...(by(start, "no_study_day").length > 0 ? ["no study day is left before the exam"] : []),
		...(startFull.length > 0 ? ["your pace fills every study day before the exam"] : []),
		...(notReady.length > 0 ? [name ? `what ${titleList(notReady)} ${notReady.length === 1 ? "needs" : "need"} won’t be solid in time` : "what comes first won’t be solid in time"] : []),
	]);
	const paceSaid = startFull.length > 0;
	const named = names && (start.length > 0 || reasons(review) > 1);
	const full = by(review, "full");
	const noDay = by(review, "no_study_day");
	const late = by(review, "too_late");
	const second = sentence([
		...(noDay.length > 0 ? [named ? `no study day is left in the final review for ${titleList(noDay)}` : "no study day is left in the final review"] : []),
		// The final review's pace alone is a plan fact he can do nothing with: said only beside the exam's own pace
		// (round 21, m2: "Your pace fills every day of the final review." under one topic left out).
		...(full.length > 0 && (named || paceSaid) ? [named ? `the final review has no room for ${titleList(full)}${paceSaid ? "" : " at your pace"}` : "the final review is full too"] : []),
		// A topic that starts too late is always named, names or not (round 18, m7: "One starts too close…", one what?).
		...(late.length > 0 ? [`${titleList(late)} ${startsWord(late)} too close to the exam for a review`] : []),
	]);
	const both = [first, second].filter((s): s is string => s !== null);
	return both.length > 0 ? both.join(" ") : null;
}

/** The pick among the topics he can take up today, as its press says it:
 *  "Start Expectation and linearity today", "Review Binomial distribution
 *  today". */
export function examGapPickWords(verb: "start" | "review" | "continue", title: string): string {
	return `${pressWord(verb)} ${title} today`;
}

/** Under the calendar's "Final review" line when it leaves taught topics
 *  out: one sentence, the names in the course head's Which topics (round
 *  20, M2: a 10-name "No room in it for…" block on the exam eve). */
export const FINAL_REVIEW_GAP_WORDS = "Not every topic is revisited in it";

/** The final review as he can place it: "the final review from 13 Nov"
 *  while it is still ahead, so a topic it has no room for reads as
 *  reviewed before it, never as not reviewed at all (round 11 integration:
 *  "No room in the final review for Binomial" beside "Review Binomial
 *  today", which the plan does before the final review); "the final
 *  review" once it is under way. Pure. */
function finalReviewName(exam: Pick<CourseExam, "finalReview">, today: string): string {
	return exam.finalReview && exam.finalReview > today ? `the final review from ${shortDay(exam.finalReview)}` : "the final review";
}

/** The taught topics the final review has no room for, standing alone,
 *  as what happens to them: they are not revisited in it (round 18, m1:
 *  "No room in the final review from 27 Nov for Similar matrices and
 *  Diagonalization" beside their rows planned 24 and 25 Nov read as if
 *  they had no day; the calendar's "No room in it for" reads under its
 *  final review). */
export function finalReviewMissWords(titles: readonly string[], exam: Pick<CourseExam, "finalReview">, today: string): string {
	return `${titleList(titles)} ${titles.length === 1 ? "is" : "are"} not revisited in ${finalReviewName(exam, today)}`;
}

/** His opening words in a lesson Ask the tutor starts, naming the topics. */
export function examGapAsk(titles: readonly string[]): string {
	return `My exam plan has no room for ${listWords(titles)}. How can I still fit ${titles.length === 1 ? "it" : "them"} in before the exam?`;
}

const EXAM_WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });

/** The exam a line points at: "today’s exam", "tomorrow’s exam",
 *  "Thursday" within the week, else its day, "3 Dec". Pure. */
function examDayWords(exam: Pick<CourseExam, "date" | "daysLeft">): string {
	if (exam.daysLeft === 0) return "today’s exam";
	if (exam.daysLeft === 1) return "tomorrow’s exam";
	return exam.daysLeft < 7 ? EXAM_WEEKDAY.format(new Date(`${exam.date}T00:00:00Z`)) : shortDay(exam.date);
}

/** The exam line, one sentence wherever the exam's plan cannot start
 *  every topic before it (Home, the course head, the calendar's exam
 *  panel), and what he can do: start the first topic the plan still
 *  starts before it (`start`), "Start with Expectation and linearity."
 *  when the plan starts it today, else on its day, "Start Stirling's
 *  formula tomorrow." (round 21, M1: once Expectation was begun the line
 *  said "Start with Joint distributions…", which the plan starts the next
 *  day). The names are one press away, in the head's Which topics (round
 *  20, M2: an 11-name amber block on all three on the exam eve, saying
 *  nothing he could do). Pure. */
export function examLineWords(exam: Pick<CourseExam, "date" | "daysLeft">, start: { title: string; day: string } | null, today: string): string {
	const line = `Not every exam topic fits before ${examDayWords(exam)}.`;
	if (!start) return line;
	const days = Math.round((Date.parse(`${start.day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
	if (days <= 0) return `${line} Start with ${start.title}.`;
	const when = days === 1 ? "tomorrow" : `on ${days < 7 ? EXAM_WEEKDAY.format(new Date(`${start.day}T00:00:00Z`)) : shortDay(start.day)}`;
	return `${line} Start ${start.title} ${when}.`;
}

/** The exam line when every topic starts in time but the final review
 *  leaves taught topics out (`missed`): the one it leaves out by name,
 *  else the names in the head's Which topics (round 20, M2: Linear
 *  Algebra's head named 11 to 17 topics; round 21, m2: "leaves some
 *  topics out" for one). Pure. */
export function finalReviewLineWords(exam: Pick<CourseExam, "date" | "daysLeft">, missed: readonly string[]): string {
	return `Your final review before ${examDayWords(exam)} leaves ${missed.length === 1 ? `out ${missed[0]}` : "some topics out"}.`;
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

/** A course page row's status for a topic the exam ahead puts after it,
 *  its planned day in the row's hint (round 12, 1 m11), in the topic
 *  page's own short words: an exam topic the plan has no room to start
 *  before the exam is "Not before the exam", one the exam leaves out "Not
 *  on the exam" (round 15, M7: on the exam eve Geometric and Variance,
 *  which the exam needs, and Covariance, which it leaves out, all read
 *  "After the exam"). */
export const ARC_ROW_EXAM_WORDS = { noRoom: "Not before the exam", leftOut: "Not on the exam" } as const;

/** What the exam's plan means for a topic it has no room to start before
 *  the exam (`examGaps`), on the topic's own page, in the engine's reason
 *  (`exam.reasons`); never "full at your pace", which he cannot act on
 *  (round 20, M2). */
export const EXAM_GAP_TOPIC_WORDS: Readonly<Record<ExamGapReason | "none", string>> = {
	none: ARC_ROW_EXAM_WORDS.noRoom,
	no_study_day: "Not before the exam, no study day is left",
	not_ready: "Not before the exam, what it needs won’t be solid in time",
	full: ARC_ROW_EXAM_WORDS.noRoom,
	too_late: ARC_ROW_EXAM_WORDS.noRoom,
};

/** A start whose first review would fall on the exam day or after. */
export const TOO_LATE_FOR_A_REVIEW = "Too close to the exam for a review before it";

/** The words for `topic` when the exam ahead has no room to start it
 *  (`doesNotFit`) or to review it (`unreviewed`); null otherwise. Pure. */
export function examGapTopicWords(topic: Pick<CourseMapTopic, "handle">, exam: Pick<CourseExam, "date" | "daysLeft" | "doesNotFit" | "unreviewed" | "reasons"> | null): string | null {
	if (!exam || exam.daysLeft < 0) return null;
	const reason = exam.reasons?.[topic.handle] ?? "none";
	if (exam.doesNotFit?.includes(topic.handle)) return EXAM_GAP_TOPIC_WORDS[reason];
	// A start too near the exam has its review fall on it or after: the final
	// review has room, his start comes too late for it (round 17, 3 m4: "Planned
	// Wed 18 Nov · No room in the final review from 15 Nov, it starts too close
	// to the exam" read as if it were not planned).
	// One planned before the final review is reviewed then, and only the
	// final review leaves it out: what happens to him, "Not in your final
	// review before the 3 Dec exam" (round 18, m1; round 20, M2: "Not
	// revisited in the final review from 28 Nov, full at your pace").
	if (exam.unreviewed?.includes(topic.handle)) return reason === "too_late" ? TOO_LATE_FOR_A_REVIEW : `Not in your final review before the ${shortDay(exam.date)} exam`;
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
	if (why.kind === "begun") return LESSON_BEGUN;
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
 *  "Next in Linear Algebra" beside the course's own name, and a lesson he
 *  began, whose row and Scheduled line already say it goes on. Pure. */
export function startsWhyTells(why: StartsWhy): boolean {
	if (why.kind === "begun") return false;
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

/** An exam held in several sessions (Edo, 19 Nov 2026). Home asks once
 *  how the session gone by went (`pastSessionWords`); his answer is one of
 *  these, saved to the record. */
export const EXAM_SESSION_WORDS = {
	passed: "Passed",
	notThisTime: "Not this time",
} as const;

const LONG_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "Sunday 29 November". */
export function longDayWords(day: string): string {
	return LONG_DAY.format(new Date(`${day}T00:00:00Z`)).replace(",", "");
}

type Sessions = { date: string; sessions?: readonly string[]; past?: string };

/** The session after the one he aims at, as a plain second line beside the
 *  exam's day ("Next session: Wednesday 3 February"); null when none is
 *  listed. Pure. */
export function nextSessionWords(exam: Sessions): string | null {
	const next = exam.sessions?.find((day) => day > exam.date);
	return next ? `Next session: ${longDayWords(next)}` : null;
}

/** Home's one ask once a session has gone by, saying truly what moved the
 *  plan: "Your Artificial Intelligence exam on Monday 21 December has gone
 *  by, so the plan now aims at the next session, Tuesday 19 January. How
 *  did it go?" Null while no session has gone by unanswered. Pure. */
export function pastSessionWords(course: string, exam: Sessions): string | null {
	if (!exam.past) return null;
	return `Your ${course} exam on ${longDayWords(exam.past)} has gone by, so the plan now aims at the next session, ${longDayWords(exam.date)}. How did it go?`;
}

/** A day beside the engine's, one form wherever a day shows (an exam, a
 *  planned review): "Today", "Tomorrow" or "Yesterday", else null, since
 *  the day itself says when and a count is not his words (round 14, m9:
 *  "Exam in 11 days", "in 16 days"). */
export function distanceWords(day: string, today: string): string | null {
	const days = daysBetween(today, day);
	if (days === 0) return "Today";
	if (days === 1) return "Tomorrow";
	if (days === -1) return "Yesterday";
	return null;
}

/** "Thursday 19 November", with "today", "tomorrow" or "yesterday" after
 *  it when it is one of those: never a count of days. */
export function dayAndNearWords(day: string, long: string, today: string): string {
	const near = distanceWords(day, today);
	return near ? `${long}, ${near.toLowerCase()}` : long;
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
	couldntReply: "The tutor couldn't reply.",
	/** A turn refused for a signed-out Claude, once Claude reads signed in (round 19, m27). */
	signedInAgain: "Signed in again. Press Enter to send.",
	/** His answer so far on the question he set aside to ask something, while
	 *  the reply to his ask never came (round 20, m14: the box dropped to
	 *  "Ask the tutor anything…" and his draft seemed gone). */
	askedDraftKept: (draft: string) => `Your answer so far stays with the question above: “${draft}”`,
	/** A send that could not reach the app, once the app answers again (round 20, m12). */
	appBack: "The app is back. Press Enter to send.",
	youStoppedReply: "You stopped the tutor before it replied.",
	youStoppedMidReply: "You stopped the tutor mid-reply.",
	tryAgain: "Try again",
	connectionDropped: "The connection dropped before the tutor finished replying.",
	tryAgainPlaceholder: "Press Enter to try again, or write something new.",
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
	/** After the ruling, whose words are the tutor's reply (round 16, m20:
	 *  the stamp printed the whole ruling the reply had just said). */
	markStands: "the mark stands",
	markChanged: "the mark changed",
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
export function disputeStampWords(dispute: { row?: string; proposed?: MarkResult; proposedHow?: MarkHow & ("ownWork" | "withHelp") }): string {
	const picked = [dispute.proposed && MARK_WORDS.result[dispute.proposed], dispute.proposedHow && MARK_HOW_WORDS[dispute.proposedHow]].filter(Boolean);
	// The try he disputed, on a card of several (round 16, m19).
	const disputed = dispute.row ? `${MARK_WORDS.youDisputed} · ${dispute.row}` : MARK_WORDS.youDisputed;
	return picked.length > 0 ? `${disputed} · ${MARK_WORDS.youThink}: ${picked.join(", ")}` : disputed;
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
 *  `standing`): every part solid, not yet, or not all of it fits. */
export const READY_WORDS = {
	ready: "Ready for the exam",
	notYet: "Not ready for the exam yet",
	/** After the least ready topics, the press that shows them all. */
	rest: "and the rest",
} as const;

/** A self-study, wherever a course would show its exam or its reviews
 *  (22 Nov 2026): what it is, that nothing comes back for review, and how
 *  it ends. */
export const SELF_STUDY_WORDS = {
	name: "Self-study",
	reached: "Learned",
	hint: "Learning on your own: no exam and no reviews. It's done once you've learned every topic.",
	reachedLine: "You've learned every topic.",
	check: "Check yourself",
	checkHint: "One practice session across every topic, if you want to see what stuck.",
} as const;

/** A closing check's opening and its name: "Git rebase check". */
export function closingCheckWords(title: string): string {
	return `${title} check`;
}

/** Where he stands for the exam as one fact of a head, a few words (the
 *  course page's head): the whole answer opens under it. "No exam"
 *  for a course without one. When the plan cannot fit all of it, the head
 *  says what it loses in its own words (`ExamReady`'s), never "Not all of
 *  it fits" (round 15, M7); not ready says for what (round 15, m10: "Not
 *  ready yet" had no object). */
export const READY_FACT_WORDS = {
	ready: "Ready for the exam",
	notYet: "Not ready for the exam yet",
	none: "No exam",
} as const;

/** An arc not started whose topics the plan gives no day yet, on the road's line. */
export const ARC_NOT_PLANNED = "Not planned yet";

/** When the plan starts an arc's next new topic, on the road's line, in
 *  the word a topic's row, Home and the calendar use for a planned start:
 *  "Planned today", "Planned 10 Dec". One word whether the arc is under way
 *  or not started (round 19, m8: arc 6 read "Starts 18 Nov" beside arc 7's
 *  "Planned 18 Nov" for the same fact). */
export function arcPlannedWords(day: string, today: string): string {
	return day <= today ? "Planned today" : `Planned ${shortDay(day)}`;
}

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

/** The Mac app's notifications (`desktop-notices.ts`), in the words Home
 *  and the sidebar use (Edo, 19 Nov 2026: "VERY sparingly", only the key
 *  study events). */
export const NOTICE_WORDS = {
	/** Today's plan: the title over Today's lines. */
	today: "Today",
	/** A course's topic map finished building: under the course's name. */
	mapReady: "Its topic map is ready",
	/** A new lesson's opening is ready and waits on him: under its title,
	 *  the sidebar's word for a session that waits on him. */
	lessonReady: "Your turn",
	/** The settings row and its hint. */
	setting: "Study notifications",
	settingHint: "Today's plan once a day, and a course map or a new lesson when it is ready while you are in another app",
} as const;

/** Today's plan in one line: Today's lines by their one name
 *  (`lessonTitle`), in Today's order. */
export function todayNoticeWords(titles: readonly string[]): string {
	return titles.join(", ");
}
