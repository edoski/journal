import type { ChatListItem, CourseMapTopic, StudyCourse } from "@/src/core";
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

export type FoldedShelf = "working" | "known" | "other";

export const SHELF_WORDS: Record<FoldedShelf, string> = { working: "Working", known: "Known", other: "Other sessions" };

const SOLID = new Set(["independent", "retained", "transferred"]);

export const unitKey = (workspace: string, handle: string) => `${workspace}#${handle}`;

/** Which standing a topic has, or null when it is not listed. Pure. */
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

/** When the unit was last studied in the app, else first taught. */
const lastAt = (u: Unit) => u.sessions[0]?.updatedAt ?? u.topic.introduced ?? "";
const overdue = (u: Unit) => (u.topic.review?.kind === "due" ? u.topic.review.overdue : 0);
const returns = (u: Unit) => u.topic.review?.date ?? "9999-12-31";
const byLearning = (a: Unit, b: Unit) => Number(b.now === "your-turn") - Number(a.now === "your-turn") || lastAt(b).localeCompare(lastAt(a));
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
		const inCourse = chats.filter((c) => c.course?.workspace === map.workspace);
		for (const topic of map.topics) {
			const key = unitKey(map.workspace, topic.handle);
			const named = sessionsOf.get(key) ?? [];
			const holding = inCourse.filter((c) => !named.includes(c) && holdsTaskOf(c, topic));
			const sessions = [...named, ...holding].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			const now = nowOf(sessions);
			const shelf = shelfOf(topic, now);
			if (shelf) units.push({ key, course, topic, shelf, sessions, now });
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

/** The one fact a row's status slot shows, by priority: a session waits on
 *  the learner, the tutor writes, a solid topic's review is due, a known
 *  topic's return, else when it was last studied in the app. A topic being
 *  learned never says "due": almost all of them are. */
export type UnitStatus =
	{ kind: "your-turn" } | { kind: "working" } | { kind: "review" } | { kind: "returns"; days: number } | { kind: "studied"; at: string } | { kind: "none" };

export function unitStatus(unit: Unit, today: string): UnitStatus {
	if (unit.now) return { kind: unit.now };
	if (unit.shelf === "review") return { kind: "review" };
	if (unit.shelf === "known" && unit.topic.review) return { kind: "returns", days: Math.max(1, daysBetween(today, unit.topic.review.date)) };
	const last = unit.sessions[0];
	return last ? { kind: "studied", at: last.updatedAt } : { kind: "none" };
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

/** Whether a session holds an open task the engine says holds the topic. */
const holdsTaskOf = (chat: ChatListItem, topic: Pick<CourseMapTopic, "tasks">) => (chat.tasks ?? []).some((key) => topic.tasks.includes(key));

/** A topic's sessions in its course, newest first: those whose transcript
 *  names it, and those holding an open task that holds it. Pure. */
export function topicSessions(chats: readonly ChatListItem[], workspace: string, topic: Pick<CourseMapTopic, "handle" | "tasks">): ChatListItem[] {
	return chats
		.filter((c) => c.course?.workspace === workspace && ((c.topics ?? []).includes(topic.handle) || holdsTaskOf(c, topic)))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Sessions started on a topic's page, by session id: the topic's handle.
 *  The app's own link, so a new session is on its topic from its first
 *  turn, before its transcript names the topic. */
export type TopicStarts = Readonly<Record<string, string>>;

/** The list with each started session also on the topic it was started
 *  on. Pure. */
export function linkStarts(chats: readonly ChatListItem[], starts: TopicStarts): ChatListItem[] {
	return chats.map((c) => {
		const handle = starts[c.id];
		const topics = c.topics ?? [];
		return handle && !topics.includes(handle) ? { ...c, topics: [...topics, handle] } : c;
	});
}

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
