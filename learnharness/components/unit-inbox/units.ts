import type { ChatListItem, CourseMap, CourseMapTask, CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";
import { leftOffWords, overdueWords, reviewWords, slipMark, STANDING_WORDS, TUTOR_WRITING, type SlipKey } from "@/components/study-words";
import { slipBeside } from "@/components/course-map/topic-map/topic-standing";
import { agoWords } from "@/components/study-home/agenda-rows/row-facts";
import { closedReview, currentSessions, pausedWords, resumableSession, sessionState } from "@/components/nav/session-state";

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
	/** The engine's study day (`CourseMap.today`), against which a press
	 *  reads whether memory asks for the topic's review (`topicOpening`). */
	today: string;
}

/** What a unit's sessions are doing now: one waits on the learner, the
 *  tutor writes in one, one is left for next time, or nothing runs. */
export type UnitNow = "your-turn" | "working" | "paused" | "left" | null;

export interface Unit {
	/** `<workspace>#<handle>`, unique across courses. */
	key: string;
	course: UnitCourse;
	topic: CourseMapTopic;
	shelf: Shelf;
	/** Newest first. A session that worked on two units is in both; `now`
	 *  reads only those the unit's topic is their own. */
	sessions: readonly ChatListItem[];
	now: UnitNow;
	/** The open task that holds the topic, the course's focused one first
	 *  (`taskOf`), or null. */
	task: CourseMapTask | null;
	/** Why the engine calls the topic weak (`slipOf`), or null. */
	slip: string | null;
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
	/** The course the inbox keeps, null for every course; absent reads as
	 *  every course. */
	scope?: string | null;
	/** What waits on the learner first, then topics being learned, the most
	 *  recently studied first, then due reviews, the weak first. */
	active: readonly Unit[];
	working: readonly Unit[];
	/** The soonest back first. */
	known: readonly Unit[];
	/** Sessions that belong to no listed unit (no own topic on one): a
	 *  general question, a lesson its plan has not named yet, or a session
	 *  older than the course rule. Newest first. */
	other: readonly ChatListItem[];
}

/** The list that folds under Today (now-shelves.md). */
export type FoldedShelf = "sessions";

export const SOLID: ReadonlySet<string> = new Set(["independent", "retained", "transferred"]);

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

/** Why the engine calls a topic weak, or what its open mistake is, in the
 *  app's words, a method he mixed it up with named by its title on the
 *  course's map; null when neither. An open mistake the engine does not
 *  call weak (a partly right answer) still reads as one, as the course's
 *  Mistakes list holds it (round 9, 2 m1). Pure. */
export function slipOf(map: Pick<CourseMap, "topics">, topic: CourseMapTopic): string | null {
	return slipBeside(topic, (handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle)?.words ?? null;
}

/** What a topic's own sessions are doing now: those that belong to it
 *  (`ownTopics`), never one that only touched it on the way, so a lesson
 *  is "Your turn" on its own topic alone; `course` as `currentSessions`
 *  reads it. Pure. */
export function nowOf(sessions: readonly ChatListItem[], handle: string, course: readonly ChatListItem[] = []): UnitNow {
	return sessionsNow(sessions.filter((c) => worksOn(c, handle)), course);
}

/** The session a topic's row resumes: of those that belong to it
 *  (`ownsTopic`), the one to pick up, as its status (`nowOf`) and its
 *  page's Now read it; never one that only touched it on the way (round
 *  13, 2 M1: Problem sheet 4, left for next time, was Vectors' Resume
 *  under On your own, since the sheet's first check was on vectors).
 *  Pure. */
export function rowResume(unit: Pick<Unit, "sessions" | "topic">): ChatListItem | null {
	return resumableSession(unit.sessions.filter((c) => worksOn(c, unit.topic.handle)));
}

/** What any of these sessions is doing now: one waits on the learner, the
 *  tutor writes in one, or one was left for next time. A topic read with
 *  every session tied to it (`topicSessions`) says what its page's Now and
 *  the session's card on Today's top say. Pure. */
export function sessionsNow(sessions: readonly ChatListItem[], course: readonly ChatListItem[] = []): UnitNow {
	const states = currentSessions(sessions, course).map(sessionState);
	if (states.includes("your-turn")) return "your-turn";
	if (states.includes("working")) return "working";
	// A reply cut off says so on its topic, never an older left session's or task's day (round 14, m33).
	if (states.includes("paused")) return "paused";
	return states.includes("left") ? "left" : null;
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
		const course = { workspace: map.workspace, title: map.title, today: map.today };
		for (const topic of map.topics) {
			const sessions = topicSessions(chats, map.workspace, topic.handle);
			const now = nowOf(sessions, topic.handle, chats);
			const shelf = shelfOf(topic, now);
			if (shelf) units.push({ key: unitKey(map.workspace, topic.handle), course, topic, shelf, sessions, now, task: taskOf(map, topic), slip: slipOf(map, topic) });
		}
	}
	const handles = new Set<string>(units.map((u) => u.topic.handle));
	const listed = new Set(units.flatMap((u) => u.sessions.filter((c) => (c.ownTopics ?? []).some((h) => handles.has(h))).map((c) => c.id)));
	const inScope = (chat: ChatListItem) => (scope === null ? true : chat.course?.workspace === scope);
	const resting = units.filter((u) => u.now !== "working");
	return {
		today: scoped[0]?.map.today ?? courses[0]?.map.today ?? "",
		scope,
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
 *   - a session waits on the learner ("Your turn"), the tutor writes in
 *     one (Working), or one is left for next time, as the session state
 *     reads them, unless a wrong answer is still open, whose slip comes
 *     first;
 *   - the engine calls the topic weak ("Not right last time", "Mistake to
 *     fix", "Mixed up with Rank", "Sure, but wrong");
 *   - a solid topic's review is due ("Due today", "Due 5 Nov");
 *   - an open task holds it, and when he left off ("Left off 6 Nov");
 *   - when its next review comes ("Back in 5d");
 *   - else when he last studied it ("Today", "6 Nov").
 * A topic still being learned never says its review is due: almost all
 * of them are.
 */
export type UnitStatus =
	| { kind: "your-turn" }
	| { kind: "working" }
	| { kind: "slip"; words: string; slip: SlipKey }
	| { kind: "review" | "task" | "back" | "studied" | "stopped"; words: string }
	/** Nothing to say; `words` names a topic he has not started ("Not
	 *  started"), which search lists beside the topics he has. */
	| { kind: "none"; words?: string };

/** When an open task was left, in the app's words ("Left off 6 Nov"):
 *  the engine's day it last changed, never its step, which the tutor
 *  writes. Pure. */
export function taskWords(task: Pick<CourseMapTask, "updated">, today: string): string {
	return leftOffWords(task.updated ? Math.max(0, daysBetween(task.updated, today)) : null, today);
}

/** The learner's own calendar day of a session's time, or a study day as
 *  it is. Pure. */
const dayOf = (at: string) => {
	if (at.length === 10) return at;
	const d = new Date(at);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** When something was last studied, in Home's words: "Today", "6 Nov".
 *  `at` is a session's time or a study day. Pure. */
export function studiedWords(at: string, today: string): string {
	const day = today || dayOf(new Date().toISOString());
	return agoWords(Math.max(0, daysBetween(dayOf(at), day)), day);
}

/** When a session left for next time was left, in the app's one phrase for
 *  work left open (round 9, 2 m6: one Eigen lesson read "Left for next
 *  time" on its topic and "Left off today" on the topic its task holds):
 *  "Left off today", "Left off 6 Nov". `today` is the engine's day. Pure. */
export function leftWords(chat: Pick<ChatListItem, "updatedAt">, today: string): string {
	return leftOffWords(Math.max(0, daysBetween(dayOf(chat.updatedAt), today)), today);
}

/** The session that speaks for a topic: of those of its own that work on
 *  it (`worksOn`), the one to pick up (`resumableSession`, against every
 *  session `chats`), never a review he closed with Done for today, which
 *  rides with the topic's next review (`closedReview`). Its page's Now
 *  resumes it, and its head and its map card say its status (round 20,
 *  m4). Null when none. Pure. */
export function topicSession(sessions: readonly ChatListItem[], handle: string, chats: readonly ChatListItem[]): ChatListItem | null {
	return resumableSession(sessions.filter((chat) => worksOn(chat, handle) && !closedReview(chat)), chats);
}

/** What an open session says, as a fact: "Your turn", the tutor writing,
 *  its stop ("Stopped by you", `pausedWords`), or the day he left it
 *  ("Left off today", `leftWords`); null for a finished one. The one
 *  wording of a session's status on its topic: its page's Now, its head
 *  and its map card say it (round 20, m4). Pure. */
export type SessionFact = { kind: "your-turn" | "working" | "stopped" | "task"; words: string };

export function sessionFact(chat: ChatListItem, today: string): SessionFact | null {
	switch (sessionState(chat)) {
		case "your-turn":
			return { kind: "your-turn", words: "Your turn" };
		case "working":
			return { kind: "working", words: TUTOR_WRITING };
		case "paused":
			return { kind: "stopped", words: pausedWords(chat) };
		case "left":
			return { kind: "task", words: leftWords(chat, today) };
		case "finished":
			return null;
	}
}

/** A topic row's one status. `asked`: Today reviews the topic
 *  (`plannedKeys`). Pure. */
export function unitStatus(unit: Unit, today: string, asked = false): UnitStatus {
	const { topic } = unit;
	const slip = unit.slip ? ({ kind: "slip", words: unit.slip, slip: slipMark(topic.signals, (handle) => handle).key } as const) : null;
	// A wrong answer still open outranks a session that waits on him or
	// was left for next time (round 8: Eigen's mistake hid behind "Left for
	// next time"; round 9, 3 m13: Determinants' behind "Your turn"), except
	// a lesson he left today with the mistake for its next session while
	// Today does not review the topic: Home has no line for it and the close
	// said where he picks up, so it says it is left off, never "Mistake to
	// fix" while Today asks nothing (round 13, 3 N4).
	const leftToday = unit.now === "left" && unit.sessions.some((c) => worksOn(c, topic.handle) && sessionState(c) === "left" && dayOf(c.updatedAt) >= today);
	if (slip && topic.signals.mistake && unit.now !== "working" && !(leftToday && !asked)) return slip;
	if (unit.now === "left") {
		const left = unit.sessions.find((c) => worksOn(c, topic.handle) && sessionState(c) === "left");
		return { kind: "task", words: left ? leftWords(left, today) : leftOffWords(null, today) };
	}
	if (unit.now === "paused") {
		const cut = unit.sessions.find((c) => worksOn(c, topic.handle) && sessionState(c) === "paused");
		return { kind: "stopped", words: pausedWords(cut ?? {}) };
	}
	if (unit.now) return { kind: unit.now };
	if (slip) return slip;
	if (unit.shelf === "review" && topic.review?.kind === "due") return { kind: "review", words: overdueWords(topic.review.overdue, today) };
	// An open task's day, unless he studied the topic itself since it last changed: then that study is the
	// latest about it (round 14, m33: Rank read "Left off 6 Nov", the sheet's day, after his Rank practice today).
	const studied = unit.sessions.find((c) => ownsTopic(c, topic.handle))?.updatedAt;
	if (unit.task && !(studied && unit.task.updated && dayOf(studied) > unit.task.updated)) return { kind: "task", words: taskWords(unit.task, today) };
	// A review held past memory's day is late already: a fact that needs
	// him, which the map's card shows, in the day it comes back ("Back Mon
	// 16 Nov"; round 18, m1).
	if (topic.review?.kind === "scheduled") return { kind: topic.review.held && topic.review.held.since < today ? "review" : "back", words: reviewWords(topic.review, today) };
	const at = unit.sessions[0]?.updatedAt ?? topic.introduced;
	if (at) return { kind: "studied", words: studiedWords(at, today) };
	return topic.level === "new" ? { kind: "none", words: STANDING_WORDS[0] } : { kind: "none" };
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

/** A topic's sessions in its course, newest first: those the engine's
 *  records tie to it (a problem posed on it, an attempt saved on it, its
 *  introduction) and those started on it. Never a session that only holds
 *  a task covering the topic, nor one whose plan has a step named like it.
 *  Pure. */
export function topicSessions(chats: readonly ChatListItem[], workspace: string, handle: string): ChatListItem[] {
	return chats.filter((c) => c.course?.workspace === workspace && (c.topics ?? []).includes(handle)).sort(newestFirst);
}

/** Whether a session belongs to a topic (`ownTopics`): started on it or
 *  named after it, never one that only touched it on the way. Pure. */
export function ownsTopic(chat: ChatListItem, handle: string): boolean {
	return (chat.ownTopics ?? []).includes(handle);
}

/** Whether a session's work is on a topic: it belongs to it (`ownsTopic`),
 *  and what it holds open, else what its steps teach, is on that topic: a
 *  question or problem waiting on him (`openOn`), else the topic its plan's
 *  steps are on (`stepsOn`). Only such a topic resumes it, reads "Your
 *  turn" or "Left off" for it, and draws its map (round 18, M2; round 19,
 *  M4: Problem sheet 4's kernel question read "Your turn" on Basis and
 *  Rank too). A session with neither works on every topic it belongs to.
 *  Pure. */
export function worksOn(chat: ChatListItem, handle: string): boolean {
	if (!ownsTopic(chat, handle)) return false;
	const on = chat.openOn ?? (chat.stepsOn ? [chat.stepsOn] : null);
	return on === null || on.includes(handle);
}

/** Whether a session's step map is a topic's: the topic its plan's steps
 *  are on (`stepsOn`), whatever its open question is on; else as it works
 *  on it (`worksOn`). Pure. */
export function mapsOn(chat: ChatListItem, handle: string): boolean {
	return chat.stepsOn ? ownsTopic(chat, handle) && chat.stepsOn === handle : worksOn(chat, handle);
}

/** The sessions in a course that hold an open task, newest first. Pure. */
export function taskSessions(chats: readonly ChatListItem[], workspace: string, task: string): ChatListItem[] {
	return chats.filter((c) => c.course?.workspace === workspace && (c.tasks ?? []).includes(task)).sort(newestFirst);
}

/** Newest first, by the last change. */
export const newestFirst = (a: ChatListItem, b: ChatListItem) => b.updatedAt.localeCompare(a.updatedAt);

/** A new session's first message from a topic's page: the prompt, led by
 *  the topic's title unless the prompt names it, so the tutor works on
 *  that topic. Pure. */
export function openingFor(topicTitle: string, prompt: string): string {
	const text = prompt.trim();
	return text.toLowerCase().includes(topicTitle.toLowerCase()) ? text : `${topicTitle}: ${text}`;
}
