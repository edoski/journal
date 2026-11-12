import type { ChatListItem, CourseMapTopic, StudyCourse } from "@/src/core";
import { sessionState } from "@/components/nav/session-state";

/**
 * The sidebar's study inbox: every unit (a course map topic) on one shelf,
 * with the sessions that worked on it. The shelves follow the engine's
 * standing and review, never the app's judgement:
 *   - Learning: taught and not yet solid, or studied right now;
 *   - Review: solid, and its spaced review is due today;
 *   - Known: solid, back on the date the engine set.
 * A topic not started is not listed: the tutor routes there.
 */
export type Shelf = "learning" | "review" | "known";

export const SHELVES: readonly Shelf[] = ["learning", "review", "known"];

export const SHELF_WORDS: Record<Shelf, string> = { learning: "Learning", review: "Review", known: "Known" };

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
}

export interface UnitInbox {
	/** The engine's study day. */
	today: string;
	learning: readonly Unit[];
	review: readonly Unit[];
	known: readonly Unit[];
	/** Sessions tied to no listed unit: a general question, or a session
	 *  older than the course rule. Newest first. */
	other: readonly ChatListItem[];
}

const SOLID = new Set(["independent", "retained", "transferred"]);

export const unitKey = (workspace: string, handle: string) => `${workspace}#${handle}`;

/** Which shelf a topic sits on, or null when it is not listed. Pure. */
export function shelfOf(topic: CourseMapTopic, now: UnitNow): Shelf | null {
	if (now !== null) return "learning";
	if (topic.level === "new") return null;
	if (!SOLID.has(topic.level)) return "learning";
	return topic.review?.kind === "due" ? "review" : "known";
}

function nowOf(sessions: readonly ChatListItem[]): UnitNow {
	const states = sessions.map(sessionState);
	if (states.includes("your-turn")) return "your-turn";
	return states.includes("working") ? "working" : null;
}

const NOW_RANK: Record<"your-turn" | "working" | "none", number> = { "your-turn": 0, working: 1, none: 2 };
const nowRank = (u: Unit) => NOW_RANK[u.now ?? "none"];
/** When the unit was last studied in the app, else first taught. */
const lastAt = (u: Unit) => u.sessions[0]?.updatedAt ?? u.topic.introduced ?? "";
const overdue = (u: Unit) => (u.topic.review?.kind === "due" ? u.topic.review.overdue : 0);
const returns = (u: Unit) => u.topic.review?.date ?? "9999-12-31";

/**
 * The inbox for one course, or every course with `scope` null. Learning:
 * what waits on the learner first, then the most recently studied.
 * Review: the units the engine calls weak first, then the longest past
 * due, the nearest the app has to "most likely forgotten". Known: the
 * soonest back first. Pure.
 */
export function buildInbox(courses: readonly StudyCourse[], chats: readonly ChatListItem[], scope: string | null): UnitInbox {
	const scoped = scope === null ? courses : courses.filter((c) => c.map.workspace === scope);
	const sessionsOf = new Map<string, ChatListItem[]>();
	for (const chat of chats) {
		if (!chat.course) continue;
		for (const handle of chat.topics ?? []) {
			const key = unitKey(chat.course.workspace, handle);
			const list = sessionsOf.get(key) ?? [];
			list.push(chat);
			sessionsOf.set(key, list);
		}
	}
	const units: Unit[] = [];
	for (const { map } of scoped) {
		const course = { workspace: map.workspace, title: map.title };
		for (const topic of map.topics) {
			const key = unitKey(map.workspace, topic.handle);
			const sessions = [...(sessionsOf.get(key) ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			const now = nowOf(sessions);
			const shelf = shelfOf(topic, now);
			if (shelf) units.push({ key, course, topic, shelf, sessions, now });
		}
	}
	const listed = new Set(units.flatMap((u) => u.sessions.map((s) => s.id)));
	const inScope = (chat: ChatListItem) => (scope === null ? true : chat.course?.workspace === scope);
	const on = (shelf: Shelf) => units.filter((u) => u.shelf === shelf);
	return {
		today: scoped[0]?.map.today ?? courses[0]?.map.today ?? "",
		learning: on("learning").sort((a, b) => nowRank(a) - nowRank(b) || lastAt(b).localeCompare(lastAt(a))),
		review: on("review").sort((a, b) => Number(b.topic.weak) - Number(a.topic.weak) || overdue(b) - overdue(a)),
		known: on("known").sort((a, b) => returns(a).localeCompare(returns(b))),
		other: chats.filter((c) => !listed.has(c.id) && inScope(c)),
	};
}

/** Whole days from one engine date to another. Pure. */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The one fact a unit's trailing column shows, by priority: a session
 *  waits on the learner, the tutor writes, a known unit's return, else
 *  when it was last studied in the app. A due review shows nothing more:
 *  almost every unit still being learned is due, and Review says it for
 *  the rest. */
export type UnitStatus =
	| { kind: "your-turn" }
	| { kind: "working" }
	| { kind: "returns"; days: number }
	| { kind: "studied"; at: string }
	| { kind: "none" };

export function unitStatus(unit: Unit, today: string): UnitStatus {
	if (unit.now) return { kind: unit.now };
	if (unit.shelf === "known" && unit.topic.review) return { kind: "returns", days: Math.max(1, daysBetween(today, unit.topic.review.date)) };
	const last = unit.sessions[0];
	return unit.shelf !== "review" && last ? { kind: "studied", at: last.updatedAt } : { kind: "none" };
}

/** "in 5d", "in 3w", "in 2mo": a known unit's return, short enough for
 *  the trailing column. Pure. */
export function returnWords(days: number): string {
	if (days < 14) return `in ${days}d`;
	if (days < 60) return `in ${Math.round(days / 7)}w`;
	return `in ${Math.round(days / 30)}mo`;
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

/** "1 session", "3 sessions". Pure. */
export function sessionCount(n: number): string {
	return n === 1 ? "1 session" : `${n} sessions`;
}

/** A topic's sessions in its course, newest first. Pure. */
export function topicSessions(chats: readonly ChatListItem[], workspace: string, handle: string): ChatListItem[] {
	return chats
		.filter((c) => c.course?.workspace === workspace && (c.topics ?? []).includes(handle))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** The review in words, with no overdue count: "Review due", "Back Thu
 *  13 Nov". Pure. */
export function reviewWords(review: CourseMapTopic["review"]): string | null {
	if (!review) return null;
	return review.kind === "due" ? "Review due" : `Back ${DAY.format(new Date(`${review.date}T00:00:00Z`)).replace(",", "")}`;
}
