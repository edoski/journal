import { courseLabel, type CourseMapTopic, type StudyCourse } from "@/src/core";
import { stepWords, type TodayRow } from "@/components/study-home/study-facts";

/** What every row candidate draws from: Today's lines, the engine's study
 *  day, and how a line opens. */
export interface RowsProps {
	rows: readonly TodayRow[];
	/** The engine's study day. */
	today: string;
	busy: boolean;
	onContinue: (workspace: string) => void;
}

/** At most this many lines; past it the last line names the other courses. */
export const MAX_LINES = 5;

/** Today's lines as shown: the first lines, and the courses folded into
 *  the last one ("Also today"). Pure. */
export function foldLines(rows: readonly TodayRow[]): { shown: readonly TodayRow[]; also: readonly TodayRow[] } {
	const shown = rows.length > MAX_LINES ? rows.slice(0, MAX_LINES - 1) : rows;
	return { shown, also: rows.slice(shown.length) };
}

/** The key React keeps a line by. Pure. */
export function lineKey(row: TodayRow): string {
	return row.kind === "session" ? row.chat.id : row.course.map.workspace;
}

/** A line's course by name, "No course" for a session outside one. Pure. */
export function courseTitle(row: TodayRow): string {
	if (row.course) return row.course.map.title;
	return row.kind === "session" && row.chat.course ? courseLabel(row.chat.course) : "No course";
}

/** A line's lesson in words: the waiting session's title, or the course's
 *  next step ("Review A, B and more"). Pure. */
export function lessonTitle(row: TodayRow): string {
	return row.kind === "session" ? row.chat.title : stepWords(row.step);
}

/** A review's reason from the engine's own fields: a lapse first (the
 *  topic it was), else how overdue the most overdue one is. Pure. */
function reviewReason(due: readonly CourseMapTopic[]): string | null {
	const lapsed = due.find((t) => t.signals.lapsed);
	if (lapsed) return `You missed ${lapsed.title} last time`;
	const overdue = Math.max(-1, ...due.map((t) => (t.review?.kind === "due" ? t.review.overdue : -1)));
	if (overdue < 0) return null;
	if (overdue === 0) return "Scheduled for today";
	if (overdue < 7) return "Starting to fade";
	const weeks = Math.floor(overdue / 7);
	return weeks === 1 ? "Fading for a week" : `Fading for ${weeks} weeks`;
}

/**
 * Why a line is on Today, in words that need no memory of the system: a
 * session waiting on the learner and since when, why a review is due (a
 * lapse, or how long it has been fading), where an open task was left, or
 * that the topic is next on the course's map. Engine fields only. Pure.
 */
export function whyNow(row: TodayRow, today: string): string | null {
	if (row.kind === "session") {
		return row.chat.updatedAt.slice(0, 10) < today ? "Waiting since yesterday" : "Waiting for your reply";
	}
	const { course, step } = row;
	switch (step.kind) {
		case "review": {
			const handles = new Set<string>(step.topics);
			return reviewReason(course.map.topics.filter((t) => handles.has(t.handle)));
		}
		case "task":
			return step.step ? `Left off at ${step.step.charAt(0).toLowerCase()}${step.step.slice(1)}` : "Started, not finished";
		case "topic":
			return "Next on your map";
		case "none":
			return null;
	}
}

/** When the learner last studied a line's course, in words: "Studied
 *  today", "Studied 3 days ago", "Studied 2 weeks ago", or "Not studied
 *  yet"; null for a line with no course. Pure. */
export function lastStudied(row: TodayRow): string | null {
	const days = row.course?.lastActiveDaysAgo;
	if (row.course === null || days === undefined) return null;
	if (days === null) return "Not studied yet";
	if (days === 0) return "Studied today";
	if (days === 1) return "Studied yesterday";
	if (days < 14) return `Studied ${days} days ago`;
	if (days < 60) return `Studied ${Math.floor(days / 7)} weeks ago`;
	return `Studied ${Math.floor(days / 30)} months ago`;
}

/** How far along a course the learner is: the topics the engine has seen
 *  taught (any level past "new"), of all the map's topics; null for an
 *  empty map. Pure. */
export function courseProgress(course: StudyCourse): { started: number; of: number } | null {
	const of = course.map.topics.length;
	if (of === 0) return null;
	return { started: course.map.topics.filter((t) => t.level !== "new").length, of };
}
