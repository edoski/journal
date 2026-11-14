import type { ChatListItem, CourseMapTopic, StudyCourse } from "@/src/core";
import { needsYouNow, type NeedsYou } from "@/components/study-home/needs-you";
import { todaysReview } from "@/components/study-home/study-facts";
import { overdueWords } from "@/components/study-words";
import { byLearning, nowOf, shelfOf, slipOf, taskOf, topicSessions, unitKey, unitStatus, type Unit, type UnitInbox, type UnitStatus } from "@/components/unit-inbox/units";

/**
 * The sidebar's list (spec: unit-inbox.md, "Today on top"): the top is
 * Home's Today (`needsYouNow`), and everything else folds onto the shelves
 * at the foot. Its pure part.
 */

/** The shelves under Today, in the order they sit. */
export type NowShelf = "working" | "learning" | "known" | "other";

/** The shelves' names. "On your own" is the course page's group and Home's
 *  "N of M on your own". */
export const NOW_SHELF_WORDS: Record<NowShelf, string> = { working: "Working", learning: "Learning", known: "On your own", other: "Other sessions" };

/** Today's lines for the sidebar: every course's, or under the course
 *  filter only that course's (its course line and the sessions in it).
 *  Pure. */
export function nowFor(courses: readonly StudyCourse[], chats: readonly ChatListItem[], scope: string | null, today: string): NeedsYou {
	if (scope === null) return needsYouNow(courses, chats, today);
	return needsYouNow(
		courses.filter((c) => c.map.workspace === scope),
		chats.filter((c) => c.course?.workspace === scope),
		today,
	);
}

/** A unit for a topic `buildInbox` did not list (a line's lead not started
 *  yet, as a task on a new topic), built as `buildInbox` builds one: its
 *  sessions in the course newest first, and what they are doing now. A
 *  topic not started rests on Learning. Pure. */
export function unitFor(course: StudyCourse, topic: CourseMapTopic, chats: readonly ChatListItem[]): Unit {
	const { workspace, title } = course.map;
	const sessions = topicSessions(chats, workspace, topic.handle);
	const now = nowOf(sessions, topic.handle);
	return { key: unitKey(workspace, topic.handle), course: { workspace, title }, topic, shelf: shelfOf(topic, now) ?? "learning", sessions, now, task: taskOf(course.map, topic), slip: slipOf(course.map, topic) };
}

/** The shelves' rows: every listed unit not on top, and the sessions on no
 *  listed topic. */
export interface RestShelves {
	/** Taught, not solid yet, or solid but weak (a lapse, a mistake to
	 *  fix): one waiting on the learner first, then the latest studied. */
	learning: Unit[];
	/** The tutor writes in one of its sessions: the latest first. */
	working: Unit[];
	/** On your own: solid and not weak, the topics Home's pie and the
	 *  course page count (`courseProgress`). The due ones first, the
	 *  longest overdue first, then the soonest back. */
	known: Unit[];
	other: ChatListItem[];
}

/** The key a session card on top holds in `restShelves`' `onTop`. */
export const sessionKey = (chatId: string) => `chat:${chatId}`;

/** Everything the top does not show, by shelf. `onTop` holds the unit keys
 *  the top lists, and `sessionKey` for each session card; each listed unit
 *  and each session is on the top or on one shelf, never both. Pure. */
export function restShelves(inbox: UnitInbox, onTop: ReadonlySet<string>): RestShelves {
	const off = (u: Unit) => !onTop.has(u.key);
	const solid = [...inbox.active.filter((u) => u.shelf === "review"), ...inbox.known].filter(off);
	return {
		learning: [...inbox.active.filter((u) => u.shelf === "learning" && off(u)), ...solid.filter((u) => u.topic.weak)].sort(byLearning),
		working: inbox.working.filter(off),
		known: solid.filter((u) => !u.topic.weak),
		other: inbox.other.filter((c) => !onTop.has(sessionKey(c.id))),
	};
}

/** The unit keys of the topics each course reviews today, as Home's line
 *  takes them up (`todaysReview`: the engine's plan, else every topic
 *  due). Pure. */
export function plannedKeys(courses: readonly StudyCourse[]): ReadonlySet<string> {
	return new Set(courses.flatMap((c) => todaysReview(c).map((t) => unitKey(c.map.workspace, t.handle))));
}

const NONE: ReadonlySet<string> = new Set();

/** A shelf row's status: the row's own fact (`unitStatus`), except that a
 *  topic in today's plan (`planned`, `plannedKeys`) with nothing more
 *  pressing says its review is due, in Home's words ("Due today", "3d
 *  overdue"). Pure. */
export function shelfStatus(unit: Unit, today: string, planned: ReadonlySet<string> = NONE): UnitStatus {
	const own = unitStatus(unit, today);
	if (!planned.has(unit.key) || !(own.kind === "returns" || own.kind === "studied" || own.kind === "none")) return own;
	return { kind: "review", words: overdueWords(unit.topic.review?.kind === "due" ? unit.topic.review.overdue : 0) };
}

/** A unit whose session waits on the learner, for a folded shelf's dot.
 *  Pure. */
export const waitsOnYou = (unit: Unit): boolean => unit.now === "your-turn";

/** The engine's study day, else the learner's own date while the engine
 *  cannot be read. Pure. */
export function studyDay(engineDay: string, now: Date): string {
	if (engineDay) return engineDay;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A topic's unit: the one the inbox lists, else one built for it
 *  (`unitFor`). Pure. */
export function topicUnit(inbox: UnitInbox, course: StudyCourse, topic: CourseMapTopic, chats: readonly ChatListItem[]): Unit {
	const key = unitKey(course.map.workspace, topic.handle);
	return [...inbox.active, ...inbox.working, ...inbox.known].find((u) => u.key === key) ?? unitFor(course, topic, chats);
}
