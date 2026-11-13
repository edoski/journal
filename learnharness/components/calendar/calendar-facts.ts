import type { CalendarCourse, CalendarRunup, ChatListItem, CourseMapTask, CourseMapTopic, ScheduledDay, TopicHandle } from "@/src/core";
import { sessionState } from "@/components/nav/session-state";
import { daysBetween, topicSessions } from "@/components/unit-inbox/units";
import { localDay, topicAction, type TopicAction } from "@/components/unit-inbox/topic-page/topic-facts";

/**
 * What the calendar draws (spec: calendar.md): the engine's dates and the
 * stored sessions as entries, one per thing on one day. The engine owns
 * every date: today's review is the one `plan` makes, a later day shows
 * `plan`'s daily plan (its reviews and new topics), an exam is the
 * record's date, and the one clock is the engine's study day. Every
 * function here is pure.
 */

export interface CourseRef {
	workspace: string;
	title: string;
}

/** What a session is, from its transcript: practice, or a teaching
 *  session at its phase (the prober's questions, the plan, the lesson). */
export type SessionType = "check-in" | "plan" | "lesson" | "practice";

export type CalendarEntry =
	| { kind: "exam"; id: string; day: string; title: string; course: CourseRef; runup: CalendarRunup | null; doesNotFit: readonly string[] }
	| { kind: "review"; id: string; day: string; title: string; course: CourseRef; topic: CourseMapTopic; overdue: boolean; action: TopicAction }
	| { kind: "new"; id: string; day: string; title: string; course: CourseRef; topic: CourseMapTopic; action: TopicAction }
	| { kind: "task"; id: string; day: string; title: string; course: CourseRef; task: CourseMapTask; topic: CourseMapTopic | null; opening: string }
	| { kind: "session"; id: string; day: string; title: string; course: CourseRef | null; chat: ChatListItem; type: SessionType; waits: boolean; topic: CourseMapTopic | null };

/** How an entry reads: its words, one per look, and where it sits in its
 *  day: exams first, then what is due (a new topic, the day's lesson,
 *  before its reviews), then what was done. A session that
 *  waits on him comes right after the exam (`rankOf`). */
export type EntryLook = "exam" | "overdue" | "review" | "new" | "task" | SessionType;

export const LOOKS: Record<EntryLook, { words: string; rank: number }> = {
	exam: { words: "Exam", rank: 0 },
	overdue: { words: "Overdue", rank: 1 },
	new: { words: "New topic", rank: 1.5 },
	review: { words: "Review", rank: 2 },
	task: { words: "Unfinished", rank: 3 },
	lesson: { words: "Lesson", rank: 4 },
	practice: { words: "Practice", rank: 4 },
	plan: { words: "Plan", rank: 4 },
	"check-in": { words: "Quiz", rank: 4 },
};

export function lookOf(entry: CalendarEntry): EntryLook {
	switch (entry.kind) {
		case "exam":
			return "exam";
		case "review":
			return entry.overdue ? "overdue" : "review";
		case "new":
			return "new";
		case "task":
			return "task";
		case "session":
			return entry.type;
	}
}

/** Where an entry sits in its day. */
export function rankOf(entry: CalendarEntry): number {
	return entry.kind === "session" && entry.waits ? 0.5 : LOOKS[lookOf(entry)].rank;
}

export function sessionType(chat: ChatListItem): SessionType {
	if (chat.kind === "practice") return "practice";
	return chat.phase === "probe" ? "check-in" : chat.phase === "plan" ? "plan" : "lesson";
}

/** The first topic the session worked on that its course's map lists. */
function sessionTopic(chat: ChatListItem, courses: readonly CalendarCourse[]): CourseMapTopic | null {
	const map = courses.find((c) => c.map.workspace === chat.course?.workspace)?.map;
	if (!map) return null;
	for (const handle of chat.topics ?? []) {
		const topic = map.topics.find((t) => t.handle === handle);
		if (topic) return topic;
	}
	return null;
}

/**
 * Every entry on the calendar, by day and then by look:
 *   - each exam on its date;
 *   - today's review as `plan` made it, each overdue when past its date,
 *     and today's new topics from `plan`'s daily plan;
 *   - each later day's reviews and new topics as the daily plan proposes;
 *   - each open task today, since the engine dates none;
 *   - each session on the day of its last message (a day after the
 *     engine's counts as today).
 * `chats` carry their topic links (units.ts linkStarts); `scope` keeps one
 * course, and with it no session outside a course.
 */
export function calendarEntries({
	courses,
	chats,
	scope,
}: {
	courses: readonly CalendarCourse[];
	chats: readonly ChatListItem[];
	scope: string | null;
}): CalendarEntry[] {
	const shown = scope === null ? courses : courses.filter((c) => c.map.workspace === scope);
	const today = courses[0]?.map.today ?? "";
	const entries: CalendarEntry[] = [];
	for (const { map, due, runup, planned, doesNotFit } of shown) {
		const course = { workspace: map.workspace, title: map.title };
		const titleOf = (handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle;
		if (map.exam) entries.push({ kind: "exam", id: `exam:${map.workspace}`, day: map.exam.date, title: `${map.title} exam`, course, runup, doesNotFit: doesNotFit.map(titleOf) });
		const facts = (topic: CourseMapTopic) => ({ title: topic.title, course, topic, action: topicAction(topic, map, topicSessions(chats, map.workspace, topic)) });
		const review = (topic: CourseMapTopic, day: string, overdue: boolean) =>
			entries.push({ kind: "review", id: `review:${map.workspace}#${topic.handle}@${day}`, day, overdue, ...facts(topic) });
		const fresh = (topic: CourseMapTopic, day: string) => entries.push({ kind: "new", id: `new:${map.workspace}#${topic.handle}`, day, ...facts(topic) });
		const topicOf = (handle: TopicHandle) => map.topics.find((t) => t.handle === handle);
		for (const handle of due ?? []) {
			const topic = topicOf(handle);
			if (topic) review(topic, today, topic.review?.kind === "due" && topic.review.overdue > 0);
		}
		for (const day of planned) {
			if (day.date < today) continue;
			for (const handle of day.date > today ? day.reviews : []) {
				const topic = topicOf(handle);
				if (topic) review(topic, day.date, false);
			}
			for (const handle of day.new) {
				const topic = topicOf(handle);
				if (topic) fresh(topic, day.date);
			}
		}
		for (const task of map.tasks) {
			const topic = map.topics.find((t) => t.tasks.includes(task.key)) ?? null;
			entries.push({ kind: "task", id: `task:${map.workspace}#${task.key}`, day: today, title: task.title, course, task, topic, opening: `Continue ${task.title}` });
		}
	}
	for (const chat of chats) {
		const workspace = chat.course?.workspace;
		if (scope !== null && workspace !== scope) continue;
		const listed = courses.find((c) => c.map.workspace === workspace);
		const course = workspace ? { workspace, title: listed?.map.title ?? chat.course!.title } : null;
		const local = localDay(chat.updatedAt);
		entries.push({
			kind: "session",
			id: `session:${chat.id}`,
			day: today && local > today ? today : local,
			title: chat.title,
			course,
			chat,
			type: sessionType(chat),
			waits: sessionState(chat) === "your-turn",
			topic: sessionTopic(chat, courses),
		});
	}
	return entries.sort((a, b) => a.day.localeCompare(b.day) || rankOf(a) - rankOf(b));
}

/** "9:00 to 12:30", a window in the Journal's own times, the hour's
 *  leading zero dropped. */
function windowWords({ start, end }: { start: string; end: string }): string {
	const short = (time: string) => time.replace(/^0/, "");
	return `${short(start)} to ${short(end)}`;
}

/** What a day's head says of its study time: "Day off", the windows
 *  ("9:00 to 12:30, 13:30 to 18:00"), or null when the Journal schedules
 *  nothing for it. */
export function studyTimeWords(day: ScheduledDay | undefined): string | null {
	if (!day) return null;
	if (day.off) return "Day off";
	return day.windows.length > 0 ? day.windows.map(windowWords).join(", ") : null;
}

const LONG_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "Sunday 29 November". */
export function longDayWords(day: string): string {
	return LONG_DAY.format(new Date(`${day}T00:00:00Z`)).replace(",", "");
}

/** How far a day is from the engine's: "Today", "Tomorrow", "In 3 days",
 *  "In 2 weeks", "Yesterday", "3 days ago". */
export function distanceWords(day: string, today: string): string {
	const days = daysBetween(today, day);
	if (days === 0) return "Today";
	if (days === 1) return "Tomorrow";
	if (days === -1) return "Yesterday";
	const span = Math.abs(days);
	const words = span < 14 ? `${span} days` : `${Math.round(span / 7)} weeks`;
	return days > 0 ? `In ${words}` : `${words} ago`;
}

/** The exam run-up in words, as `plan` counts it. */
export function runupWords(runup: CalendarRunup): string {
	const days = runup.studyDays === 1 ? "1 day" : `${runup.studyDays} days`;
	return `${days} left for new topics, about ${runup.pace} each`;
}

/** The topics the plan cannot fit before the exam, named. */
export function misfitWords(titles: readonly string[]): string | null {
	return titles.length > 0 ? `Not enough days left for ${titles.join(", ")}` : null;
}

/** True when no entry falls in [start, end). */
export function quietBetween(entries: readonly CalendarEntry[], start: string, end: string): boolean {
	return !entries.some((entry) => entry.day >= start && entry.day < end);
}
