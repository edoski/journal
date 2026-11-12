import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";
import { examText } from "@/components/start/course-facts";
import { sessionState } from "@/components/nav/session-state";

/** "Span", "Span and Rank", "Span, Rank and more": at most two titles,
 *  never a count. Pure. */
export function titleList(titles: readonly string[]): string {
	const [first, second] = titles;
	if (second === undefined) return first ?? "";
	return titles.length > 2 ? `${first}, ${second} and more` : `${first} and ${second}`;
}

function overdue(t: CourseMapTopic): number {
	return t.review?.kind === "due" ? t.review.overdue : -1;
}

/** The topics due for review today, the ones the engine calls weak first,
 *  then the most overdue. Pure. */
export function reviewTopics(course: StudyCourse): CourseMapTopic[] {
	return course.map.topics
		.filter((t) => t.review?.kind === "due")
		.sort((a, b) => Number(b.weak) - Number(a.weak) || overdue(b) - overdue(a));
}

/** Today's review as the engine planned it (`plan`'s due list, in its
 *  order), else, without a plan, every topic due today. Pure. */
export function todaysReview(course: StudyCourse): CourseMapTopic[] {
	if (course.due === null) return reviewTopics(course);
	const byHandle = new Map(course.map.topics.map((t) => [t.handle, t]));
	return course.due.flatMap((h) => byHandle.get(h) ?? []);
}

/** What a course's Continue takes up, in the order the doctrine answers
 *  "Let's continue": today's reviews, then the open task at its step, else
 *  the current topic. `topics` are the topics it works on. */
export type NextStep =
	| { kind: "review"; titles: readonly string[]; topics: readonly TopicHandle[]; then: string | null }
	| { kind: "task"; title: string; step: string | null; topics: readonly TopicHandle[] }
	| { kind: "topic"; title: string; topics: readonly TopicHandle[] }
	| { kind: "none" };

export function nextStepOf(course: StudyCourse): NextStep {
	const { map } = course;
	const task = map.tasks.find((t) => t.key === map.focus) ?? map.tasks[0];
	const current = map.topics.find((t) => t.handle === map.current);
	const reviews = todaysReview(course);
	if (reviews.length > 0) {
		return { kind: "review", titles: reviews.map((t) => t.title), topics: reviews.map((t) => t.handle), then: task?.title ?? current?.title ?? null };
	}
	if (task) {
		const held = map.topics.filter((t) => t.tasks.includes(task.key)).map((t) => t.handle);
		return { kind: "task", title: task.title, step: task.step, topics: held.length > 0 ? held : current ? [current.handle] : [] };
	}
	return current ? { kind: "topic", title: current.title, topics: [current.handle] } : { kind: "none" };
}

/** The step as a short instruction: "Review Linear independence and Rank",
 *  "Continue Problem sheet 4", "Start Rank and the column space". Pure. */
export function stepWords(step: NextStep): string {
	switch (step.kind) {
		case "review":
			return `Review ${titleList(step.titles)}`;
		case "task":
			return `Continue ${step.title}`;
		case "topic":
			return `Continue ${step.title}`;
		case "none":
			return "Start a lesson";
	}
}

/** The exam in words with its date, "Exam in 11 days", or null. Pure. */
export function examWords(course: StudyCourse): string | null {
	return examText(course.map.exam);
}

/**
 * The home's one cross-course order: a course inside its exam run-up
 * first, nearest exam first, then the nearest exam outside it, then the
 * most recent activity, then the engine's order. TEMPORARY: it moves into
 * the engine once the brief names the day's course; no other app-side
 * priority exists. Pure.
 */
export function byUrgency(courses: readonly StudyCourse[]): StudyCourse[] {
	const examDays = (c: StudyCourse) => (c.map.exam && c.map.exam.daysLeft >= 0 ? c.map.exam.daysLeft : Infinity);
	const idleDays = (c: StudyCourse) => c.lastActiveDaysAgo ?? Infinity;
	const runup = (c: StudyCourse) => (c.unready === null ? 1 : 0);
	return courses
		.map((course, index) => ({ course, index }))
		.sort(
			(a, b) =>
				runup(a.course) - runup(b.course) ||
				examDays(a.course) - examDays(b.course) ||
				idleDays(a.course) - idleDays(b.course) ||
				a.index - b.index,
		)
		.map(({ course }) => course);
}

/** Where a step sits on its course's map: the map's steps (its layers,
 *  from 1) its topics span, of how many. */
export interface PathPlace {
	from: number;
	to: number;
	of: number;
}

/** The place of some topics among the map's layers; null when none is on
 *  the map. Pure. */
export function pathPlace(topics: readonly TopicHandle[], layers: readonly (readonly TopicHandle[])[]): PathPlace | null {
	const steps = topics.map((h) => layers.findIndex((layer) => layer.includes(h))).filter((i) => i >= 0);
	if (steps.length === 0) return null;
	return { from: Math.min(...steps) + 1, to: Math.max(...steps) + 1, of: layers.length };
}

/** "Step 5 of 7", "Steps 2–5 of 7". Pure. */
export function placeWords(place: PathPlace): string {
	return place.from === place.to ? `Step ${place.from} of ${place.of}` : `Steps ${place.from}–${place.to} of ${place.of}`;
}

/** One line of Today: a session waiting on the learner, or a course's next
 *  step. Each course has one line. */
export type TodayRow =
	| { kind: "session"; chat: ChatListItem; course: StudyCourse | null }
	| { kind: "course"; course: StudyCourse; step: NextStep };

/**
 * Today's lines: a session waiting on the learner since yesterday takes its
 * course's line (most recent first, those with no course on their own
 * line), then every other course's next step, most urgent first. An older
 * waiting session stays in the sidebar. Pure.
 */
export function todayRows(courses: readonly StudyCourse[], waiting: readonly ChatListItem[], today: string): TodayRow[] {
	const since = addDays(today, -1);
	const recent = waiting.filter((c) => c.updatedAt.slice(0, 10) >= since);
	const ordered = byUrgency(courses);
	const byWorkspace = new Map(ordered.map((c) => [c.map.workspace, c]));
	const sessions: TodayRow[] = [];
	const taken = new Set<string>();
	for (const chat of recent) {
		const ws = chat.course?.workspace;
		if (ws && taken.has(ws)) continue;
		const course = ws ? (byWorkspace.get(ws) ?? null) : null;
		if (course) taken.add(ws!);
		sessions.push({ kind: "session", chat, course });
	}
	const rest: TodayRow[] = ordered.filter((c) => !taken.has(c.map.workspace)).map((course) => ({ kind: "course", course, step: nextStepOf(course) }));
	return [...sessions, ...rest];
}

/** The exam in words while the course is in its run-up, else null. Pure. */
export function runupExam(course: StudyCourse): string | null {
	return course.unready === null ? null : examWords(course);
}

/** A line's second line: what follows the reviews, or the open task's
 *  step; null for a session or a topic. Pure. */
export function stepDetail(step: NextStep): string | null {
	if (step.kind === "review") return step.then ? `Then ${step.then}` : null;
	if (step.kind === "task") return step.step;
	return null;
}

/** An engine date (YYYY-MM-DD) plus some days. Pure. */
export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

const LONG_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "Sunday 8 November" for an engine date. Pure. */
export function longDay(date: string): string {
	return LONG_DAY.format(new Date(`${date}T00:00:00Z`)).replace(",", "");
}

/** Sessions whose turn is the learner's, most recent first. Pure. */
export function waitingSessions(chats: readonly ChatListItem[]): ChatListItem[] {
	return chats
		.filter((c) => sessionState(c) === "your-turn")
		.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}
