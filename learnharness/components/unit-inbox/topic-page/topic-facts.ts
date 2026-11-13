import type { ChatListItem, CourseMap, CourseMapTask, CourseMapTopic, SessionPlan, StudyCourse, TopicAttempt, TopicRecord } from "@/src/core";
import { needOf, standingOf, type Standing } from "@/components/course-map/topic-map/topic-standing";
import { sessionState, type SessionState } from "@/components/nav/session-state";
import { activeSession, daysBetween, shelfOf } from "@/components/unit-inbox/units";
import type { TopicRead } from "@/components/unit-inbox/topic-page/use-topic-read";

/**
 * What every topic page candidate reads (spec: topic-page.md). Engine
 * fields and session facts only: the app judges no standing, and the one
 * clock is the engine's study day. Every function here is pure.
 */

/** The page's one action: open the session that waits or is being
 *  written, or start one whose first message is `opening`. */
export type TopicAction =
	| { kind: "resume" | "open"; chat: ChatListItem }
	| { kind: "review" | "start" | "study"; opening: string }
	| { kind: "continue"; opening: string; task: CourseMapTask | null };

export const ACTION_WORDS: Record<TopicAction["kind"], string> = { resume: "Resume", open: "Open", review: "Review", continue: "Continue", start: "Start", study: "Study" };

/** A place to pick the topic back up: the session that waits or is being
 *  written, or an open task that holds the topic. */
export type Pickup =
	| { kind: "session"; chat: ChatListItem; waits: boolean; title: string; where: string; when: string }
	| { kind: "task"; task: CourseMapTask; title: string; where: string; when: string | null; opening: string };

export interface SessionEntry {
	chat: ChatListItem;
	state: SessionState;
	/** The day of its last message, YYYY-MM-DD. */
	day: string;
	/** "Today", "3d ago". */
	when: string;
	/** Its plan, when its tutor authored one. */
	plan: SessionPlan | null;
}

/** One thing the head says beside the pie, as an icon and a few words in
 *  the map's: why the engine calls the topic weak, or its review, due or
 *  dated. */
export interface HeadMark {
	kind: "slip" | "review";
	words: string;
}

export interface TopicFacts {
	course: { workspace: string; title: string };
	topic: CourseMapTopic;
	/** The engine's study day. */
	today: string;
	/** The pie and its words; null when the head line is silent: a topic
	 *  not started that has a session, where "Not started" would contradict
	 *  the lesson. */
	standing: Standing | null;
	/** What the head says beside the pie; empty when the line is silent. */
	marks: readonly HeadMark[];
	/** "Studied 3 days ago"; null when nothing dates it or the line is silent. */
	studied: string | null;
	/** The engine's diagnosed mistake, else the last attempt of a topic it
	 *  calls weak when that attempt was not right, in the tutor's words. */
	mistake: string | null;
	action: TopicAction;
	pickups: readonly Pickup[];
	/** Every session of the topic, newest first. */
	sessions: readonly SessionEntry[];
	/** The sessions not already shown as a pick-up row. */
	listed: readonly SessionEntry[];
	/** Newest first; empty without the topic read. */
	attempts: readonly TopicAttempt[];
	titleOf: (handle: string) => string;
}

/** The open tasks that hold the topic: the focused one first, then the
 *  map's order. */
export function heldTasks(topic: CourseMapTopic, map: CourseMap): CourseMapTask[] {
	const held = map.tasks.filter((task) => topic.tasks.includes(task.key));
	return [...held.filter((task) => task.key === map.focus), ...held.filter((task) => task.key !== map.focus)];
}

/**
 * The one thing to do on the topic now, first match: resume the session
 * that waits on him, open the one the tutor is writing in, review a topic
 * he can do on his own whose review is due, continue the open task that
 * holds it, start a topic not started, continue one still being learned
 * whose review is due or not set, else study (the engine has set the next
 * review in the future, so nothing needs him).
 */
export function topicAction(topic: CourseMapTopic, map: CourseMap, sessions: readonly ChatListItem[]): TopicAction {
	const active = activeSession(sessions);
	if (active) return { kind: sessionState(active) === "your-turn" ? "resume" : "open", chat: active };
	const shelf = shelfOf(topic, null);
	if (shelf === "review") return { kind: "review", opening: `Review ${topic.title}` };
	const [task] = heldTasks(topic, map);
	if (task) return { kind: "continue", opening: `Continue ${task.title}`, task };
	if (topic.level === "new") return { kind: "start", opening: topic.title };
	if (shelf === "learning" && topic.review?.kind !== "scheduled") return { kind: "continue", opening: `Continue ${topic.title}`, task: null };
	return { kind: "study", opening: topic.title };
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayOf = (date: string) => DAY.format(new Date(`${date}T00:00:00Z`)).replace(",", "");

/** "Next review Fri 13 Nov". */
export function nextReviewWords(date: string): string {
	return `Next review ${dayOf(date)}`;
}

/** A day against the engine's: "Today", "Yesterday", else "Tue 3 Nov". A
 *  day after the engine's reads as today. */
export function dayWords(day: string, today: string): string {
	const days = daysBetween(day, today);
	if (days <= 0) return "Today";
	return days === 1 ? "Yesterday" : dayOf(day);
}

/** How long ago in a trailing column, in Home's words (`studiedAgo`):
 *  "Today", "Yesterday", "3d ago", "2w ago", "3mo ago". */
export function agoWords(days: number): string {
	if (days <= 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 14) return `${days}d ago`;
	if (days < 60) return `${Math.floor(days / 7)}w ago`;
	return `${Math.floor(days / 30)}mo ago`;
}

/** When he last studied the topic, in Home's words (`lastStudied`):
 *  "Studied today", "Studied 3 days ago", "Studied 2 weeks ago". */
export function studiedWords(days: number): string {
	if (days <= 0) return "Studied today";
	if (days === 1) return "Studied yesterday";
	if (days < 14) return `Studied ${days} days ago`;
	if (days < 60) return `Studied ${Math.floor(days / 7)} weeks ago`;
	return `Studied ${Math.floor(days / 30)} months ago`;
}

/**
 * What the head says beside the pie, in the map's words, each drawn as an
 * icon and a few words: why the engine calls the topic weak, then its
 * review, due (only for a topic he can do on his own: nearly every topic
 * being learned is due) or dated.
 */
export function headMarks(topic: CourseMapTopic, titleOf: (handle: string) => string): HeadMark[] {
	const slip = topic.weak ? needOf(topic, titleOf)?.words : null;
	const review =
		shelfOf(topic, null) === "review"
			? needOf({ ...topic, weak: false }, titleOf)?.words
			: topic.review?.kind === "scheduled"
				? nextReviewWords(topic.review.date)
				: null;
	return [...(slip ? [{ kind: "slip" as const, words: slip }] : []), ...(review ? [{ kind: "review" as const, words: review }] : [])];
}

/** The latest day anything says he studied the topic: its newest attempt,
 *  its newest session's last message, the day it was first taught. */
export function lastStudiedDay(topic: CourseMapTopic, sessions: readonly SessionEntry[], attempts: readonly TopicAttempt[]): string | null {
	const days = [attempts[0]?.date, sessions[0]?.day, topic.introduced].filter((day): day is string => Boolean(day));
	return days.length > 0 ? days.reduce((latest, day) => (day > latest ? day : latest)) : null;
}

/** What went wrong, when the engine can say: the mistake it diagnosed,
 *  else, for a topic it calls weak, the newest attempt in the tutor's
 *  words when that attempt was not right. */
export function mistakeOf(topic: CourseMapTopic, attempts: readonly TopicAttempt[]): string | null {
	if (topic.signals.gap) return topic.signals.gap;
	const [last] = attempts;
	return topic.weak && last && last.result !== "correct" ? last.text : null;
}

/** The local day of a moment, YYYY-MM-DD: the engine's study day is the
 *  local date, so a session's day is too. */
export function localDay(iso: string): string {
	const at = new Date(iso);
	return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}

/** The topic's sessions as the page lists them, in the order given
 *  (newest first), each with its plan when the read holds one. A session
 *  dated after the engine's day counts as that day. */
export function sessionEntries(sessions: readonly ChatListItem[], plans: readonly SessionPlan[], today: string): SessionEntry[] {
	return sessions.map((chat) => {
		const local = localDay(chat.updatedAt);
		const day = local > today ? today : local;
		return { chat, state: sessionState(chat), day, when: agoWords(daysBetween(day, today)), plan: plans.find((plan) => plan.id === chat.id) ?? null };
	});
}

/** What the pick-up row says while the tutor writes and no step is known. */
export const WRITING = "The tutor is writing";

/** Where a session stands: the step its newest tagged question is about;
 *  else, while the tutor writes, that it writes; else a practice problem
 *  waits; else a question waits. */
function whereOf(entry: SessionEntry): string {
	const step = entry.plan?.tree.nodes.find((node) => node.id === entry.plan?.current);
	if (step) return step.title;
	if (entry.state !== "your-turn") return WRITING;
	return entry.chat.pendingProblem ? "Problem waiting" : "Question waiting";
}

/**
 * The places to pick the topic back up: the session that waits on him or
 * is being written, if any, then each open task that holds the topic at
 * the step it was left on, the focused one first.
 */
export function pickupsOf(topic: CourseMapTopic, map: CourseMap, entries: readonly SessionEntry[], record: TopicRecord | null, today: string): Pickup[] {
	const active = activeSession(entries.map((entry) => entry.chat));
	const entry = entries.find((e) => e.chat === active);
	const session: Pickup[] = entry ? [{ kind: "session", chat: entry.chat, waits: entry.state === "your-turn", title: entry.chat.title, where: whereOf(entry), when: entry.when }] : [];
	const tasks = heldTasks(topic, map).map((task): Pickup => {
		const updated = record?.tasks.find((t) => t.key === task.key)?.updated;
		return { kind: "task", task, title: task.title, where: task.step ?? "Unfinished", when: updated ? agoWords(daysBetween(updated, today)) : null, opening: `Continue ${task.title}` };
	});
	return [...session, ...tasks];
}

/** How an attempt went, and the one thing worth saying about it: the
 *  method he reached for in its place, that he was sure and wrong, or
 *  that he had a hint. */
export function attemptMark(attempt: TopicAttempt, titleOf: (handle: string) => string): { result: "right" | "partly" | "missed"; words: string | null } {
	const result = attempt.result === "correct" ? "right" : attempt.result === "partial" ? "partly" : "missed";
	if (attempt.chose) return { result, words: `Mixed up with ${titleOf(attempt.chose)}` };
	if (attempt.result === "incorrect" && attempt.sure === "confident") return { result, words: "Sure, but wrong" };
	return { result, words: attempt.unaided ? null : "With a hint" };
}

/** Everything a candidate draws, from the course, the topic, its sessions
 *  (newest first) and the topic read; `read` is null when it failed. */
export function topicFacts({ course, topic, sessions, read }: { course: StudyCourse; topic: CourseMapTopic; sessions: readonly ChatListItem[]; read: TopicRead | null }): TopicFacts {
	const { map } = course;
	const titleOf = (handle: string) => map.topics.find((t) => t.handle === handle)?.title ?? handle;
	const attempts = read?.record?.attempts ?? [];
	const entries = sessionEntries(sessions, read?.plans ?? [], map.today);
	const pickups = pickupsOf(topic, map, entries, read?.record ?? null, map.today);
	const picked = new Set(pickups.flatMap((pickup) => (pickup.kind === "session" ? [pickup.chat.id] : [])));
	const silent = topic.level === "new" && sessions.length > 0;
	const studied = lastStudiedDay(topic, entries, attempts);
	return {
		course: { workspace: map.workspace, title: map.title },
		topic,
		today: map.today,
		standing: silent ? null : standingOf(topic),
		marks: silent ? [] : headMarks(topic, titleOf),
		studied: !silent && studied ? studiedWords(daysBetween(studied, map.today)) : null,
		mistake: mistakeOf(topic, attempts),
		action: topicAction(topic, map, sessions),
		pickups,
		sessions: entries,
		listed: entries.filter((entry) => !picked.has(entry.chat.id)),
		attempts,
		titleOf,
	};
}
