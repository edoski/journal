/**
 * The course map: one course's topics and their edges as the learning
 * engine's `map` verb reports them. Engine fields only: the level, the
 * review, the weak verdict and its signals are the engine's own, and the
 * app computes no standing from them.
 */

/** An engine topic key, verbatim. */
export type TopicHandle = string & { readonly __topic: unique symbol };

/** The engine's level vocabulary, word for word (learning/progress.py `_level`), in order. */
export const TOPIC_LEVELS = ["new", "introduced", "attempted", "assisted", "independent", "retained", "transferred"] as const;
export type TopicLevel = (typeof TOPIC_LEVELS)[number];

export function isTopicLevel(value: unknown): value is TopicLevel {
	return (TOPIC_LEVELS as readonly unknown[]).includes(value);
}

/** The topic's review on the day the engine's daily plan puts it: `due`
 *  exactly when that day is today, with the days since memory asked for
 *  it; a review the plan moves to a later day is `scheduled` for that day,
 *  not overdue. */
export type TopicReview = { kind: "due"; date: string; overdue: number } | { kind: "scheduled"; date: string };

/** Why the engine calls a topic weak: each its own engine field, shown as is. */
export interface TopicSignals {
	gap: string | null;
	lapsed: boolean;
	stale: boolean;
	/** Wrongly chosen method -> times, since the last solid verdict. */
	choiceErrors: Readonly<Record<string, number>>;
	confidentErrors: number;
	/** He answered right after the mistake, a partial answer since or
	 *  not: the topic stays weak until a later day's unaided answer
	 *  settles it. */
	repaired: boolean;
}

/** How he has best answered a topic he cannot yet do on his own (the
 *  engine's `right`): right with no help (on the day it was learned), with
 *  help, as a guess, on doubtful evidence, or partly. */
export type RightAnswer = "unaided" | "helped" | "guess" | "uncertain" | "partial";

export interface CourseMapTopic {
	handle: TopicHandle;
	/** The engine title; the handle when the record has none. */
	title: string;
	level: TopicLevel;
	/** The study day it was first taught, when it was. */
	introduced: string | null;
	review: TopicReview | null;
	/** The engine's weak verdict. */
	weak: boolean;
	/** At the `assisted` level, how he has best answered it; absent at
	 *  every other level. */
	right?: RightAnswer;
	signals: TopicSignals;
	/** Keys of open tasks that hold this topic. */
	tasks: readonly string[];
	/** Why the course leaves the topic out (off the exam): the engine keeps
	 *  it off the plan and keeps its history. */
	excluded?: string;
	/** The day the engine's daily plan, made with every course, starts
	 *  this untaught topic; absent once taught or when the plan has no
	 *  room for it. */
	starts?: string;
}

/** `needs`: the prerequisite comes before the topic that needs it.
 *  `contrasts`: competing methods, unordered, listed once per pair. */
export type CourseMapEdge =
	| { kind: "needs"; prerequisite: TopicHandle; topic: TopicHandle }
	| { kind: "contrasts"; pair: readonly [TopicHandle, TopicHandle] };

export interface CourseMapTask {
	key: string;
	title: string;
	step: string | null;
	/** The engine's day the task last changed, where he left off it. */
	updated: string | null;
}

export interface CourseMap {
	workspace: string;
	title: string;
	/** The engine's study day, never the app's clock. */
	today: string;
	revision: number;
	exam: { date: string; daysLeft: number } | null;
	current: TopicHandle | null;
	/** The focused open task's key. */
	focus: string | null;
	tasks: readonly CourseMapTask[];
	/** Engine path order: prerequisites first. */
	topics: readonly CourseMapTopic[];
	edges: readonly CourseMapEdge[];
}

/** Of a session's candidate topics, the ones the course map lists as never
 *  introduced: what a lesson's close marks introduced. Pure. */
export function topicsToIntroduce(candidates: readonly string[], map: CourseMap): string[] {
	const wanted = new Set(candidates);
	return map.topics.filter((t) => wanted.has(t.handle) && t.introduced === null).map((t) => t.handle);
}
