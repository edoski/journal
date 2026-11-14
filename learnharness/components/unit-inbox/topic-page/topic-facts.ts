import type { ChatListItem, CourseMap, CourseMapTask, CourseMapTopic, SessionPlan, StudyCourse, TopicAttempt, TopicRecord } from "@/src/core";
import { needOf, standingOf, type Standing } from "@/components/course-map/topic-map/topic-standing";
import { heldWords, overdueWords, returnWords, type SlipKey } from "@/components/study-words";
import { continueMove, resumableSession, sessionState, type ContinueMove, type SessionState } from "@/components/nav/session-state";
import { daysBetween, shelfOf, taskSessions, topicSessions } from "@/components/unit-inbox/units";
import type { TopicRead } from "@/components/unit-inbox/topic-page/use-topic-read";

/**
 * What the topic page reads (spec: topic-page.md). Engine
 * fields and session facts only: the app judges no standing, and the one
 * clock is the engine's study day. Every function here is pure.
 */

/** The page's one action: open the session that waits, is being written
 *  or stopped, or the lesson Continue picks up; else start one whose first
 *  message is `opening`, `from` a finished lesson when Continue starts a
 *  fresh session from it (FINISHED_LESSON). */
export type TopicAction =
	| { kind: "resume" | "open"; chat: ChatListItem }
	| { kind: "continue"; chat: ChatListItem; task: CourseMapTask | null }
	| { kind: "review" | "start" | "study"; opening: string }
	| { kind: "continue"; opening: string; task: CourseMapTask | null; from?: string };

/** What a press on an open task does: open the session Continue picks up,
 *  else start one with `opening`, `from` a finished lesson as above. */
export type Press = { open: ChatListItem } | { opening: string; from?: string };

/** A Continue move as a press: no move starts a new session. */
export function pressOf(move: ContinueMove | null, opening: string): Press {
	if (move?.kind === "open") return { open: move.chat };
	return move ? { opening, from: move.from.id } : { opening };
}

/** Continue on a task or a topic, as the page's action. */
function continueAction(sessions: readonly ChatListItem[], opening: string, task: CourseMapTask | null): TopicAction {
	const press = pressOf(continueMove(sessions), opening);
	return "open" in press ? { kind: "continue", chat: press.open, task } : { kind: "continue", ...press, task };
}

export const ACTION_WORDS: Record<TopicAction["kind"], string> = { resume: "Resume", open: "Open", review: "Review", continue: "Continue", start: "Start", study: "Study" };

/** A place to pick the topic back up: the session that waits or is being
 *  written, or an open task that holds the topic. */
export type Pickup =
	| { kind: "session"; chat: ChatListItem; waits: boolean; title: string; where: string; when: string }
	| { kind: "task"; task: CourseMapTask; title: string; where: string; when: string | null; press: Press };

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
	/** A slip's own kind, which picks its icon (`slip-icons.ts`). */
	slip?: SlipKey;
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
	/** Why its next review waits past the day memory asks for it
	 *  (`heldWords`); null when nothing holds it back. */
	waits: string | null;
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
 * on the topic that waits on him or that the tutor stopped in, open the one
 * the tutor is writing in, review it when the engine has its review due
 * (a new review session, never an old lesson), continue the open task that
 * holds it, start a topic not started, continue one being learned that has
 * no review set, else study (the engine has set the next review in the
 * future, so nothing needs him). Continue picks up the lesson that holds
 * the task, or the topic's newest lesson, as the session model says
 * (`continueMove`). `chats` are every session; the topic's are those the
 * engine's records tie to it (`topicSessions`).
 */
export function topicAction(topic: CourseMapTopic, map: CourseMap, chats: readonly ChatListItem[]): TopicAction {
	const sessions = topicSessions(chats, map.workspace, topic.handle);
	const active = resumableSession(sessions);
	if (active) return { kind: sessionState(active) === "working" ? "open" : "resume", chat: active };
	if (topic.review?.kind === "due") return { kind: "review", opening: `Review ${topic.title}` };
	const [task] = heldTasks(topic, map);
	if (task) return continueAction(taskSessions(chats, map.workspace, task.key), `Continue ${task.title}`, task);
	if (topic.level === "new") return { kind: "start", opening: topic.title };
	if (shelfOf(topic, null) === "learning" && !topic.review) return continueAction(sessions, `Continue ${topic.title}`, null);
	return { kind: "study", opening: topic.title };
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** A date as the page writes it: "Tue 3 Nov". */
export const dayOf = (date: string) => DAY.format(new Date(`${date}T00:00:00Z`)).replace(",", "");

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

/** When he last studied the topic: "Studied today", "Studied 3 days
 *  ago", "Studied 2 weeks ago". */
export function studiedWords(days: number): string {
	if (days <= 0) return "Studied today";
	if (days === 1) return "Studied yesterday";
	if (days < 14) return `Studied ${days} days ago`;
	if (days < 60) return `Studied ${Math.floor(days / 7)} weeks ago`;
	return `Studied ${Math.floor(days / 30)} months ago`;
}

/**
 * What the head says beside the pie, in the app's words (study-words.ts),
 * each drawn as an icon and a few words: why the engine calls the topic
 * weak, then its review, due ("3d overdue") or dated ("Back in 5d"), as
 * the map, Home and the sidebar say it. `today` is the engine's study day.
 */
export function headMarks(topic: CourseMapTopic, titleOf: (handle: string) => string, today: string): HeadMark[] {
	const need = topic.weak ? needOf(topic, titleOf) : null;
	const review =
		topic.review?.kind === "due"
			? overdueWords(topic.review.overdue)
			: topic.review?.kind === "scheduled"
				? returnWords(Math.max(1, daysBetween(today, topic.review.date)))
				: null;
	return [...(need ? [{ kind: "slip" as const, words: need.words, ...(need.slip ? { slip: need.slip } : {}) }] : []), ...(review ? [{ kind: "review" as const, words: review }] : [])];
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

/** What the pick-up row says of a session the tutor stopped in mid-reply
 *  when no step is known. */
export const STOPPED = "Stopped mid-reply";

/** Where a session stands: the step its newest tagged question is about;
 *  else, while the tutor writes, that it writes; else that it stopped
 *  mid-reply; else a practice problem waits; else a question waits. */
function whereOf(entry: SessionEntry): string {
	const step = entry.plan?.tree.nodes.find((node) => node.id === entry.plan?.current);
	if (step) return step.title;
	if (entry.state === "working") return WRITING;
	if (entry.state === "paused") return STOPPED;
	return entry.chat.pendingProblem ? "Problem waiting" : "Question waiting";
}

/**
 * The places to pick the topic back up: the session that waits on him, is
 * being written or stopped, if any, then each open task that holds the
 * topic at the step it was left on, the focused one first, except a task
 * that session holds. A task's press continues the lesson that holds it.
 */
export function pickupsOf(topic: CourseMapTopic, map: CourseMap, entries: readonly SessionEntry[], chats: readonly ChatListItem[], record: TopicRecord | null, today: string): Pickup[] {
	const active = resumableSession(entries.map((entry) => entry.chat));
	const entry = entries.find((e) => e.chat === active);
	const session: Pickup[] = entry ? [{ kind: "session", chat: entry.chat, waits: entry.state !== "working", title: entry.chat.title, where: whereOf(entry), when: entry.when }] : [];
	const tasks = heldTasks(topic, map)
		.filter((task) => !active?.tasks?.includes(task.key))
		.map((task): Pickup => {
			const updated = record?.tasks.find((t) => t.key === task.key)?.updated;
			const press = pressOf(continueMove(taskSessions(chats, map.workspace, task.key)), `Continue ${task.title}`);
			return { kind: "task", task, title: task.title, where: task.step ?? "Unfinished", when: updated ? agoWords(daysBetween(updated, today)) : null, press };
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

/** Everything the page draws, from the course, the topic, every
 *  session and the topic read; `read` is null when it failed. */
export function topicFacts({ course, topic, chats, read }: { course: StudyCourse; topic: CourseMapTopic; chats: readonly ChatListItem[]; read: TopicRead | null }): TopicFacts {
	const { map } = course;
	const sessions = topicSessions(chats, map.workspace, topic.handle);
	const titleOf = (handle: string) => map.topics.find((t) => t.handle === handle)?.title ?? handle;
	const attempts = read?.record?.attempts ?? [];
	const entries = sessionEntries(sessions, read?.plans ?? [], map.today);
	const pickups = pickupsOf(topic, map, entries, chats, read?.record ?? null, map.today);
	const picked = new Set(pickups.flatMap((pickup) => (pickup.kind === "session" ? [pickup.chat.id] : [])));
	const silent = topic.level === "new" && sessions.length > 0;
	const studied = lastStudiedDay(topic, entries, attempts);
	return {
		course: { workspace: map.workspace, title: map.title },
		topic,
		today: map.today,
		standing: silent ? null : standingOf(topic),
		marks: silent ? [] : headMarks(topic, titleOf, map.today),
		studied: !silent && studied ? studiedWords(daysBetween(studied, map.today)) : null,
		mistake: mistakeOf(topic, attempts),
		waits: heldWords(topic.review, map.exam?.date ?? null),
		action: topicAction(topic, map, chats),
		pickups,
		sessions: entries,
		listed: entries.filter((entry) => !picked.has(entry.chat.id)),
		attempts,
		titleOf,
	};
}
