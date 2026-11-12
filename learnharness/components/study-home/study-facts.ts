import type { ChatListItem, CourseMapTopic, StudyCourse, TopicLevel } from "@/src/core";
import { examText } from "@/components/start/course-facts";
import { sessionState } from "@/components/nav/session-state";

/** The engine's seven levels in three bands a glance can read. The engine
 *  owns every level; this only groups its words. */
export type Band = "solid" | "learning" | "new";

const BAND_OF: Record<TopicLevel, Band> = {
	new: "new",
	introduced: "learning",
	attempted: "learning",
	assisted: "learning",
	independent: "solid",
	retained: "solid",
	transferred: "solid",
};

export const BAND_WORDS: Record<Band, string> = { solid: "Solid", learning: "Learning", new: "Not started" };

export function bandOf(level: TopicLevel): Band {
	return BAND_OF[level];
}

/** One topic as the home draws it: its band, and whether it needs a review
 *  now (due today) or the engine calls it weak. */
export interface TopicMark {
	title: string;
	band: Band;
	due: boolean;
	weak: boolean;
}

/** Every topic in path order. Pure. */
export function topicMarks(course: StudyCourse): TopicMark[] {
	return course.map.topics.map((t) => ({ title: t.title, band: bandOf(t.level), due: t.review?.kind === "due", weak: t.weak }));
}

/** The strip's words for a screen reader: each band named with its topics'
 *  share in plain words, never a percentage. Pure. */
export function marksSummary(marks: readonly TopicMark[]): string {
	const total = marks.length;
	if (total === 0) return "No topics yet";
	const parts = (["solid", "learning", "new"] as const)
		.map((band) => [band, marks.filter((m) => m.band === band).length] as const)
		.filter(([, n]) => n > 0)
		.map(([band, n]) => `${BAND_WORDS[band].toLowerCase()} ${n} of ${total}`);
	return `Topics: ${parts.join(", ")}`;
}

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

/** Inside the exam run-up, the topics not started yet, in path order;
 *  empty outside it. Pure. */
export function notStartedBeforeExam(course: StudyCourse): CourseMapTopic[] {
	return course.unready === null ? [] : course.map.topics.filter((t) => t.level === "new");
}

/** What a course's Continue takes up, in the order the doctrine answers
 *  "Let's continue": today's reviews, then the open task at its step, else
 *  the current topic. */
export type NextStep =
	| { kind: "review"; topics: readonly string[]; gap: string | null }
	| { kind: "task"; title: string; step: string | null }
	| { kind: "topic"; title: string }
	| { kind: "none" };

export function nextStepOf(course: StudyCourse): NextStep {
	const reviews = reviewTopics(course);
	if (reviews.length > 0) return { kind: "review", topics: reviews.map((t) => t.title), gap: reviews[0]!.signals.gap };
	const { map } = course;
	const task = map.tasks.find((t) => t.key === map.focus) ?? map.tasks[0];
	if (task) return { kind: "task", title: task.title, step: task.step };
	const current = map.topics.find((t) => t.handle === map.current);
	return current ? { kind: "topic", title: current.title } : { kind: "none" };
}

/** The step as a short instruction: "Review Linear independence and Rank",
 *  "Continue Problem sheet 4", "Start Rank and the column space". Pure. */
export function stepWords(step: NextStep): string {
	switch (step.kind) {
		case "review":
			return `Review ${titleList(step.topics)}`;
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

/** "Studied today", "Studied yesterday", "Studied 11 days ago", "Not
 *  studied yet". Pure. */
export function lastStudiedWords(daysAgo: number | null): string {
	if (daysAgo === null) return "Not studied yet";
	if (daysAgo === 0) return "Studied today";
	if (daysAgo === 1) return "Studied yesterday";
	return `Studied ${daysAgo} days ago`;
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

/** The one thing worth doing now: a session waiting on the learner's reply
 *  (the most recent), else the most urgent course's next step. */
export type NextUp =
	| { kind: "session"; chat: ChatListItem }
	| { kind: "course"; course: StudyCourse; step: NextStep }
	| { kind: "none" };

export function nextUp(courses: readonly StudyCourse[], waiting: readonly ChatListItem[]): NextUp {
	const chat = waiting[0];
	if (chat) return { kind: "session", chat };
	for (const course of byUrgency(courses)) {
		const step = nextStepOf(course);
		if (step.kind !== "none") return { kind: "course", course, step };
	}
	return { kind: "none" };
}

/** A review the engine scheduled after today and within the week. */
export interface UpcomingReview {
	date: string;
	course: string;
	workspace: string;
	topic: string;
}

/** Every course's reviews scheduled in the next seven days, by date, then
 *  course urgency, then path order. Pure. */
export function upcomingReviews(courses: readonly StudyCourse[]): UpcomingReview[] {
	const items: UpcomingReview[] = [];
	for (const course of byUrgency(courses)) {
		const end = addDays(course.map.today, 7);
		for (const t of course.map.topics) {
			if (t.review?.kind === "scheduled" && t.review.date > course.map.today && t.review.date <= end) {
				items.push({ date: t.review.date, course: course.map.title, workspace: course.map.workspace, topic: t.title });
			}
		}
	}
	return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** An engine date (YYYY-MM-DD) plus some days. Pure. */
export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

const LONG_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "Sunday 8 November" for an engine date. Pure. */
export function longDay(date: string): string {
	return LONG_DAY.format(new Date(`${date}T00:00:00Z`)).replace(",", "");
}

/** "Thu 13 Nov" for an engine date. Pure. */
export function shortDay(date: string): string {
	return SHORT_DAY.format(new Date(`${date}T00:00:00Z`)).replace(",", "");
}

/** Sessions whose turn is the learner's, most recent first. Pure. */
export function waitingSessions(chats: readonly ChatListItem[]): ChatListItem[] {
	return chats
		.filter((c) => sessionState(c) === "your-turn")
		.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/** A course's standing in at most two short sentences, from the engine's
 *  verdicts: the weak topics due now by name, then, inside the exam
 *  run-up, the topics not started; else the reviews due; else that
 *  nothing is due. Pure. */
export function standingWords(course: StudyCourse): string {
	const reviews = reviewTopics(course);
	const weak = reviews.filter((t) => t.weak).map((t) => t.title);
	const untaught = notStartedBeforeExam(course).map((t) => t.title);
	const parts: string[] = [];
	if (weak.length > 0) parts.push(`${titleList(weak)} ${weak.length === 1 ? "is" : "are"} slipping.`);
	if (untaught.length > 0) parts.push(`Not started: ${titleList(untaught)}.`);
	if (parts.length > 0) return parts.join(" ");
	if (reviews.length > 0) return `${titleList(reviews.map((t) => t.title))} ${reviews.length === 1 ? "is" : "are"} due for review.`;
	return "Nothing due for review.";
}

/** The next step's detail line: the open task's step, else the gap the
 *  engine noted on the first review; null when there is none. Pure. */
export function stepDetail(step: NextStep): string | null {
	if (step.kind === "task") return step.step;
	if (step.kind === "review") return step.gap;
	return null;
}

/** What a course's Continue takes up, said without repeating the reviews
 *  the standing sentence names: "Reviews, then Problem sheet 4", "Problem
 *  sheet 4", "Rank and the column space". Pure. */
export function continueWords(course: StudyCourse): string {
	const { map } = course;
	const task = map.tasks.find((t) => t.key === map.focus) ?? map.tasks[0];
	const work = task?.title ?? map.topics.find((t) => t.handle === map.current)?.title ?? null;
	const reviews = reviewTopics(course).length > 0;
	if (reviews) return work ? `Reviews, then ${work}` : "Reviews";
	return work ?? "Start a lesson";
}
