import type { ChatListItem, CourseMapTopic, StudyCourse } from "@/src/core";
import { needsYouNow, type NeedsYou } from "@/components/study-home/needs-you";
import { todaysReview } from "@/components/study-home/study-facts";
import { overdueWords } from "@/components/study-words";
import type { NowItem } from "@/components/unit-inbox/today/today-top";
import { byLearning, newestFirst, nowOf, ownsTopic, shelfOf, slipOf, taskOf, topicSessions, unitKey, unitStatus, type Unit, type UnitInbox, type UnitStatus } from "@/components/unit-inbox/units";

/**
 * The sidebar's list (spec: unit-inbox.md, "Today on top"): the top is
 * Home's Today (`needsYouNow`), and under it one folded Sessions list,
 * every session newest first. Its pure part.
 */

/** The one list under Today: every session, T3 Code's thread list. */
export const SESSIONS_WORDS = "Sessions";

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
	const { workspace, title, today } = course.map;
	const sessions = topicSessions(chats, workspace, topic.handle);
	const now = nowOf(sessions, topic.handle, chats);
	return { key: unitKey(workspace, topic.handle), course: { workspace, title, today }, topic, shelf: shelfOf(topic, now) ?? "learning", sessions, now, task: taskOf(course.map, topic), slip: slipOf(course.map, topic) };
}

/** Every listed topic Today does not take up, by where it stands: the
 *  course page's groups and the maps' facts read them (`sidebarSays`). */
export interface RestTopics {
	/** Taught, not solid yet, or solid but weak (a lapse, a mistake to
	 *  fix): one waiting on the learner first, then the latest studied. */
	learning: Unit[];
	/** The tutor writes in one of its sessions: the latest first. */
	working: Unit[];
	/** On your own: solid and not weak, the topics Home's pie and the
	 *  course page count (`courseProgress`). The due ones first, the
	 *  longest overdue first, then the soonest back. */
	known: Unit[];
}

/** The key a session card on top holds in `restTopics`' `onTop`. */
export const sessionKey = (chatId: string) => `chat:${chatId}`;

/** The keyboard walk's name for a course card on top: a course's line with
 *  no topic to lead with. */
export const courseKey = (workspace: string) => `course:${workspace}`;

/** Every listed topic the top does not take up, by where it stands.
 *  `onTop` holds the unit keys the top lists; each listed unit is on the
 *  top or in one group, never both. Pure. */
export function restTopics(inbox: UnitInbox, onTop: ReadonlySet<string>): RestTopics {
	const off = (u: Unit) => !onTop.has(u.key);
	const solid = [...inbox.active.filter((u) => u.shelf === "review"), ...inbox.known].filter(off);
	return {
		learning: [...inbox.active.filter((u) => u.shelf === "learning" && off(u)), ...solid.filter((u) => u.topic.weak)].sort(byLearning),
		working: inbox.working.filter(off),
		known: solid.filter((u) => !u.topic.weak),
	};
}

/** The Sessions list (spec: now-shelves.md): every session under the
 *  course filter (`scope`, null for every course), newest first, less the
 *  ones Today draws as their own card (`sessionKey` in `onTop`), since T3
 *  Code lists a thread in one place only. A session on a topic Today takes
 *  up is still listed: the card is the topic, the row the session. Pure. */
export function restSessions(chats: readonly ChatListItem[], scope: string | null, onTop: ReadonlySet<string>): ChatListItem[] {
	return chats.filter((c) => (scope === null || c.course?.workspace === scope) && !onTop.has(sessionKey(c.id))).sort(newestFirst);
}

/** The sessions whose state Today's top already says: each session card's,
 *  and the sessions a topic card's Your turn or Tutor writing comes from
 *  (those that belong to its topic, `ownsTopic`). The folded Sessions
 *  list lights its dot and keeps a running row in view only for the rest.
 *  Pure. */
export function saidOnTop(top: readonly NowItem[]): ReadonlySet<string> {
	return new Set(top.flatMap((i) => (i.kind === "session" ? [i.chat.id] : i.kind === "topic" ? i.unit.sessions.filter((c) => ownsTopic(c, i.unit.topic.handle)).map((c) => c.id) : [])));
}

/** The unit keys of the topics each course reviews today, as Home's line
 *  takes them up (`todaysReview`: the engine's plan, else every topic
 *  due). Pure. */
export function plannedKeys(courses: readonly StudyCourse[]): ReadonlySet<string> {
	return new Set(courses.flatMap((c) => todaysReview(c).map((t) => unitKey(c.map.workspace, t.handle))));
}

const NONE: ReadonlySet<string> = new Set();

/** A topic's fact off the top, as the course page's rows and the maps'
 *  cards say it: its own (`unitStatus`), except that a topic in today's
 *  plan (`planned`, `plannedKeys`) with nothing more pressing says its
 *  review is due, in Home's words ("Due today", "3d overdue"). Pure. */
export function shelfStatus(unit: Unit, today: string, planned: ReadonlySet<string> = NONE): UnitStatus {
	const own = unitStatus(unit, today, planned.has(unit.key));
	const dated = own.kind === "back" || (own.kind === "review" && unit.topic.review?.kind === "scheduled");
	if (!planned.has(unit.key) || !(dated || own.kind === "studied" || own.kind === "none")) return own;
	return { kind: "review", words: overdueWords(unit.topic.review?.kind === "due" ? unit.topic.review.overdue : 0, today) };
}

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
