import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";
import { examText } from "@/components/start/course-facts";
import { continueMove, sessionState, type SessionState } from "@/components/nav/session-state";
import { taskSessions, topicSessions } from "@/components/unit-inbox/units";
import { CONTINUE_OPENING } from "@/components/start/course-facts";

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
	| { kind: "task"; key: string; title: string; step: string | null; topics: readonly TopicHandle[] }
	| { kind: "topic"; title: string; topics: readonly TopicHandle[]; started: boolean }
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
		return { kind: "task", key: task.key, title: task.title, step: task.step, topics: held.length > 0 ? held : current ? [current.handle] : [] };
	}
	return current ? { kind: "topic", title: current.title, topics: [current.handle], started: current.level !== "new" } : { kind: "none" };
}

/** The step as a short instruction: "Review Linear independence and Rank",
 *  "Continue Problem sheet 4", "Start Poisson distribution" for a topic not
 *  started. Pure. */
export function stepWords(step: NextStep): string {
	switch (step.kind) {
		case "review":
			return `Review ${titleList(step.titles)}`;
		case "task":
			return `Continue ${step.title}`;
		case "topic":
			return `${step.started ? "Continue" : "Start"} ${step.title}`;
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

/** Where a lesson sits in its course: the positions it spans (from 1), of
 *  how many. */
export interface PathPlace {
	from: number;
	to: number;
	of: number;
}

/** One line of Today: a session to pick up, or a course's next step. */
export type TodayRow =
	| { kind: "session"; chat: ChatListItem; course: StudyCourse | null }
	| { kind: "course"; course: StudyCourse; step: NextStep };

/** Whether a session works on a course's next step: it holds the open task,
 *  or it was started on, or worked on, every topic the step takes up. */
function covers(chat: ChatListItem, step: NextStep): boolean {
	if (step.kind === "none") return true;
	if (step.kind === "task" && chat.tasks?.some((key) => key === step.key)) return true;
	const topics = new Set(chat.topics ?? []);
	return step.topics.every((h) => topics.has(h));
}

/**
 * Today's lines: each session to pick up since yesterday (it waits on the
 * learner, the tutor writes in it, or stopped mid-reply), most recent
 * first, then each course's next step, most urgent first, unless a session
 * shown already works on it. A session stays on its line while the tutor
 * writes. An older session to pick up stays in the sidebar. Pure.
 */
export function todayRows(courses: readonly StudyCourse[], open: readonly ChatListItem[], today: string): TodayRow[] {
	const since = addDays(today, -1);
	const recent = open.filter((c) => c.updatedAt.slice(0, 10) >= since);
	const ordered = byUrgency(courses);
	const byWorkspace = new Map(ordered.map((c) => [c.map.workspace, c]));
	const sessions: TodayRow[] = recent.map((chat) => ({ kind: "session", chat, course: (chat.course && byWorkspace.get(chat.course.workspace)) ?? null }));
	const rest = ordered.flatMap((course): TodayRow[] => {
		const step = nextStepOf(course);
		const taken = recent.some((chat) => chat.course?.workspace === course.map.workspace && covers(chat, step));
		return taken ? [] : [{ kind: "course", course, step }];
	});
	return [...sessions, ...rest];
}

/** The exam in words while the course is in its run-up, else null. Pure. */
export function runupExam(course: StudyCourse): string | null {
	return course.unready === null ? null : examWords(course);
}

/** An engine date (YYYY-MM-DD) plus some days. Pure. */
export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** The study home's question for the hour of the learner's day: "What
 *  are we studying this morning?", "…this afternoon?", "…this evening?",
 *  "…tonight?". Pure. */
export function studyQuestion(hour: number): string {
	const when = hour >= 5 && hour < 12 ? "this morning" : hour >= 12 && hour < 18 ? "this afternoon" : hour >= 18 && hour < 22 ? "this evening" : "tonight";
	return `What are we studying ${when}?`;
}

/** What a press on a course's line does: open a session, or start one
 *  with an opening on some topics, `from` a finished lesson it picks up. */
export type CourseMove = { kind: "open"; chat: ChatListItem } | { kind: "start"; opening: string; topics: readonly TopicHandle[]; from?: string };

/**
 * A course's line, pressed: take up its next step. A review opens a session
 * on those topics that is still to pick up, else starts a review of them,
 * named for them; never an older lesson. An open task or the current topic
 * continues the lesson that holds it, as the session model says
 * (`continueMove`), else starts one. With nothing to take up, a session
 * starts and the tutor proposes. Pure.
 */
export function courseMove(course: StudyCourse, chats: readonly ChatListItem[]): CourseMove {
	const step = nextStepOf(course);
	const { workspace } = course.map;
	const opening = stepWords(step);
	if (step.kind === "none") return { kind: "start", opening: CONTINUE_OPENING, topics: [] };
	const held = step.kind === "task" ? taskSessions(chats, workspace, step.key) : topicSessions(chats, workspace, step.topics[0] ?? "").filter((c) => covers(c, step));
	const move = step.kind === "review" ? (pickUp(held) ? continueMove(held) : null) : continueMove(held);
	if (move?.kind === "open") return { kind: "open", chat: move.chat };
	return { kind: "start", opening, topics: step.topics, ...(move ? { from: move.from.id } : {}) };
}

/** The states a session is picked up from: it waits on the learner, the
 *  tutor writes in it, or the tutor stopped mid-reply. */
const PICK_UP: ReadonlySet<SessionState> = new Set(["your-turn", "working", "paused"]);
const pickUp = (sessions: readonly ChatListItem[]) => sessions.some((c) => PICK_UP.has(sessionState(c)));

/** The sessions to pick up, most recent first. Pure. */
export function openSessions(chats: readonly ChatListItem[]): ChatListItem[] {
	return chats
		.filter((c) => PICK_UP.has(sessionState(c)))
		.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}
