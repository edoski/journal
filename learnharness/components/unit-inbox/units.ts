import type { ChatListItem, CourseMap, CourseMapTask, CourseMapTopic, StudyCourse } from "@/src/core";
import { overdueWords, slipShort } from "@/components/course-map/topic-map/topic-standing";
import { agoWords } from "@/components/study-home/agenda-rows/row-facts";
import { sessionState } from "@/components/nav/session-state";

/**
 * The sidebar's topics. Each unit (a course map topic the learner has
 * started) has a standing the engine sets, never the app:
 *   - learning: taught and not yet solid, or studied right now;
 *   - review: solid, and its spaced review is due today;
 *   - known: solid, back on the date the engine set.
 * A topic not started is not listed: the tutor routes there.
 */
export type Shelf = "learning" | "review" | "known";

export interface UnitCourse {
	workspace: string;
	title: string;
}

/** What a unit's sessions are doing now: one waits on the learner, the
 *  tutor writes in one, or nothing runs. */
export type UnitNow = "your-turn" | "working" | null;

export interface Unit {
	/** `<workspace>#<handle>`, unique across courses. */
	key: string;
	course: UnitCourse;
	topic: CourseMapTopic;
	shelf: Shelf;
	/** Newest first. A session that worked on two units is in both. */
	sessions: readonly ChatListItem[];
	now: UnitNow;
	/** The open task that holds the topic, the course's focused one first
	 *  (`taskOf`), or null. */
	task: CourseMapTask | null;
}

/**
 * The sidebar's sections, T3 Code's inbox for topics: the topics to act on
 * in one list with no header (T3's Active), then three folded shelves at
 * the foot. Working holds topics the tutor is writing in (T3's Working),
 * Known the solid topics on the engine's timer (T3's Snoozed: each wakes
 * onto the list when its review falls due), and Other the sessions on no
 * listed topic, where T3 keeps Settled.
 */
export interface UnitInbox {
	/** The engine's study day. */
	today: string;
	/** What waits on the learner first, then topics being learned, the most
	 *  recently studied first, then due reviews, the weak first. */
	active: readonly Unit[];
	working: readonly Unit[];
	/** The soonest back first. */
	known: readonly Unit[];
	/** Sessions tied to no listed unit: a general question, or a session
	 *  older than the course rule. Newest first. */
	other: readonly ChatListItem[];
}

/** The shelves that fold under Today. */
export type FoldedShelf = "working" | "learning" | "known" | "other";

const SOLID = new Set(["independent", "retained", "transferred"]);

export const unitKey = (workspace: string, handle: string) => `${workspace}#${handle}`;

/** Which standing a topic has, or null when it is not listed. Pure. */
export function shelfOf(topic: CourseMapTopic, now: UnitNow): Shelf | null {
	if (now !== null) return "learning";
	if (topic.level === "new") return null;
	if (!SOLID.has(topic.level)) return "learning";
	return topic.review?.kind === "due" ? "review" : "known";
}

/** The open task that holds a topic: the course's focused task when it
 *  does, else the first. Pure. */
export function taskOf(map: Pick<CourseMap, "tasks" | "focus">, topic: CourseMapTopic): CourseMapTask | null {
	const held = map.tasks.filter((task) => topic.tasks.includes(task.key));
	return held.find((task) => task.key === map.focus) ?? held[0] ?? null;
}

/** What a topic's sessions are doing now. Pure. */
export function nowOf(sessions: readonly ChatListItem[]): UnitNow {
	const states = sessions.map(sessionState);
	if (states.includes("your-turn")) return "your-turn";
	return states.includes("working") ? "working" : null;
}

/** When the unit was last studied in the app, else first taught. */
const lastAt = (u: Unit) => u.sessions[0]?.updatedAt ?? u.topic.introduced ?? "";
const overdue = (u: Unit) => (u.topic.review?.kind === "due" ? u.topic.review.overdue : 0);
const returns = (u: Unit) => u.topic.review?.date ?? "9999-12-31";
/** Learning's order: one waiting on the learner first, then the latest
 *  studied. */
export const byLearning = (a: Unit, b: Unit) => Number(b.now === "your-turn") - Number(a.now === "your-turn") || lastAt(b).localeCompare(lastAt(a));
const byReview = (a: Unit, b: Unit) => Number(b.topic.weak) - Number(a.topic.weak) || overdue(b) - overdue(a);

/**
 * The sidebar for one course, or every course with `scope` null. Active:
 * what waits on the learner, then the topics being learned (the latest
 * studied first), then due reviews (the engine's weak first, then the
 * longest past due, the nearest the app has to "most likely forgotten").
 * Pure.
 */
export function buildInbox(courses: readonly StudyCourse[], chats: readonly ChatListItem[], scope: string | null): UnitInbox {
	const scoped = scope === null ? courses : courses.filter((c) => c.map.workspace === scope);
	const units: Unit[] = [];
	for (const { map } of scoped) {
		const course = { workspace: map.workspace, title: map.title };
		for (const topic of map.topics) {
			const sessions = topicSessions(chats, map.workspace, topic.handle);
			const now = nowOf(sessions);
			const shelf = shelfOf(topic, now);
			if (shelf) units.push({ key: unitKey(map.workspace, topic.handle), course, topic, shelf, sessions, now, task: taskOf(map, topic) });
		}
	}
	const listed = new Set(units.flatMap((u) => u.sessions.map((s) => s.id)));
	const inScope = (chat: ChatListItem) => (scope === null ? true : chat.course?.workspace === scope);
	const resting = units.filter((u) => u.now !== "working");
	return {
		today: scoped[0]?.map.today ?? courses[0]?.map.today ?? "",
		active: [...resting.filter((u) => u.shelf === "learning").sort(byLearning), ...resting.filter((u) => u.shelf === "review").sort(byReview)],
		working: units.filter((u) => u.now === "working").sort((a, b) => lastAt(b).localeCompare(lastAt(a))),
		known: resting.filter((u) => u.shelf === "known").sort((a, b) => returns(a).localeCompare(returns(b))),
		other: chats.filter((c) => !listed.has(c.id) && inScope(c)),
	};
}

/** Whole days from one engine date to another. Pure. */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The one fact a topic row ends with, the fact that tells it from its
 * neighbours, in Home's words (spec: unit-inbox.md, "Status slot"). By
 * priority:
 *   - a session waits on the learner ("Your turn"), or the tutor writes
 *     in one (Working), as the session state reads them;
 *   - the engine calls the topic weak ("Missed last time", "Mistake to
 *     fix", "Mixed up", "Sure, but wrong");
 *   - a solid topic's review is due ("Due today", "3d overdue");
 *   - an open task holds it, and where he left off ("At part (c)");
 *   - when its next review comes ("Back in 5d");
 *   - else when he last studied it ("Today", "3d ago").
 * A topic still being learned never says its review is due: almost all
 * of them are.
 */
export type UnitStatus =
	| { kind: "your-turn" }
	| { kind: "working" }
	| { kind: "slip" | "review" | "task" | "returns" | "studied"; words: string }
	| { kind: "none" };

/** Where an open task was left, in Home's slot words: its step up to the
 *  first colon ("At part (c)"), else "Unfinished". Pure. */
export function taskWords(task: CourseMapTask): string {
	if (!task.step) return "Unfinished";
	const step = task.step.split(":")[0]!.trimEnd();
	return `At ${step.charAt(0).toLowerCase()}${step.slice(1)}`;
}

/** The learner's own calendar day of a session's time, or a study day as
 *  it is. Pure. */
const dayOf = (at: string) => {
	if (at.length === 10) return at;
	const d = new Date(at);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** When something was last studied, in Home's words: "Today", "3d ago".
 *  `at` is a session's time or a study day. Pure. */
export function studiedWords(at: string, today: string): string {
	return agoWords(Math.max(0, daysBetween(dayOf(at), today || dayOf(new Date().toISOString()))));
}

export function unitStatus(unit: Unit, today: string): UnitStatus {
	if (unit.now) return { kind: unit.now };
	const { topic } = unit;
	if (topic.weak) return { kind: "slip", words: topic.signals.lapsed ? "Missed last time" : slipShort(topic) };
	if (unit.shelf === "review" && topic.review?.kind === "due") return { kind: "review", words: overdueWords(topic.review.overdue) };
	if (unit.task) return { kind: "task", words: taskWords(unit.task) };
	if (topic.review?.kind === "scheduled") return { kind: "returns", words: returnWords(Math.max(1, daysBetween(today, topic.review.date))) };
	const at = unit.sessions[0]?.updatedAt ?? topic.introduced;
	return at ? { kind: "studied", words: studiedWords(at, today) } : { kind: "none" };
}

const TWIN_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** The sessions of a list whose title another session in it shares, each
 *  with its own day ("6 Nov"), so two runs of "Total probability practice"
 *  tell apart. Titles compare without case or outer space. Pure. */
export function sessionTwins(chats: readonly ChatListItem[]): ReadonlyMap<string, string> {
	const name = (c: ChatListItem) => c.title.trim().toLowerCase();
	const seen = new Map<string, number>();
	for (const c of chats) seen.set(name(c), (seen.get(name(c)) ?? 0) + 1);
	return new Map(chats.filter((c) => seen.get(name(c))! > 1).map((c) => [c.id, TWIN_DAY.format(new Date(c.updatedAt))]));
}

/** A course's monogram, T3 Code's fallback for a project with no favicon:
 *  the initials of its first two words. Pure. */
export function monogram(title: string): string {
	const words = title.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
	return words
		.slice(0, 2)
		.map((w) => w[0]!.toUpperCase())
		.join("");
}

/** "Back in 5d", "Back in 3w", "Back in 2mo": when a known topic's review
 *  comes, short enough for the trailing column, in the course page's
 *  "Back" word. Pure. */
export function returnWords(days: number): string {
	if (days < 14) return `Back in ${days}d`;
	if (days < 60) return `Back in ${Math.round(days / 7)}w`;
	return `Back in ${Math.round(days / 30)}mo`;
}

/** The standing in plain words: what the engine's level means for him.
 *  The engine owns the level; this only names it. Pure. */
export const LEVEL_WORDS: Record<CourseMapTopic["level"], string> = {
	new: "Not started",
	introduced: "Taught, not tried yet",
	attempted: "Tried, not right yet",
	assisted: "Right with help",
	independent: "Right on your own once",
	retained: "Right on your own, more than once",
	transferred: "Used in a new setting",
};

/** A topic's sessions in its course, newest first: those the engine's
 *  records tie to it (a problem posed on it, an attempt saved on it, its
 *  introduction) and those started on it. Never a session that only holds
 *  a task covering the topic, nor one whose plan has a step named like it.
 *  Pure. */
export function topicSessions(chats: readonly ChatListItem[], workspace: string, handle: string): ChatListItem[] {
	return chats.filter((c) => c.course?.workspace === workspace && (c.topics ?? []).includes(handle)).sort(newestFirst);
}

/** The sessions in a course that hold an open task, newest first. Pure. */
export function taskSessions(chats: readonly ChatListItem[], workspace: string, task: string): ChatListItem[] {
	return chats.filter((c) => c.course?.workspace === workspace && (c.tasks ?? []).includes(task)).sort(newestFirst);
}

const newestFirst = (a: ChatListItem, b: ChatListItem) => b.updatedAt.localeCompare(a.updatedAt);

/** A new session's first message from a topic's page: the prompt, led by
 *  the topic's title unless the prompt names it, so the tutor works on
 *  that topic. Pure. */
export function openingFor(topicTitle: string, prompt: string): string {
	const text = prompt.trim();
	return text.toLowerCase().includes(topicTitle.toLowerCase()) ? text : `${topicTitle}: ${text}`;
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** The review in words, with no overdue count: "Review due", "Back Thu
 *  13 Nov". Pure. */
export function reviewWords(review: CourseMapTopic["review"]): string | null {
	if (!review) return null;
	return review.kind === "due" ? "Review due" : `Back ${DAY.format(new Date(`${review.date}T00:00:00Z`)).replace(",", "")}`;
}
