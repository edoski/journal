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

/** Why a line is on Today: its kind (which picks its icon), the full
 *  sentence, and the few words that fit beside an icon. */
export interface Why {
	kind: "reply" | "missed" | "review" | "task" | "next";
	/** "You missed Chain rule last time". */
	words: string;
	/** "Missed Chain rule". */
	short: string;
}

/** A review's reason from the engine's own fields: a lapse first (the
 *  topic it was), else how overdue the most overdue one is. Pure. */
function reviewReason(due: readonly CourseMapTopic[]): Why | null {
	const lapsed = due.find((t) => t.signals.lapsed);
	if (lapsed) return { kind: "missed", words: `You missed ${lapsed.title} last time`, short: `Missed ${lapsed.title}` };
	const overdue = Math.max(-1, ...due.map((t) => (t.review?.kind === "due" ? t.review.overdue : -1)));
	if (overdue < 0) return null;
	if (overdue === 0) return { kind: "review", words: "Due today", short: "Due today" };
	if (overdue < 7) return { kind: "review", words: overdue === 1 ? "Overdue by a day" : `Overdue by ${overdue} days`, short: `${overdue}d overdue` };
	const weeks = Math.floor(overdue / 7);
	return { kind: "review", words: weeks === 1 ? "Overdue by a week" : `Overdue by ${weeks} weeks`, short: `${weeks}w overdue` };
}

/**
 * Why a line is on Today, in words that need no memory of the system: a
 * session waiting on the learner and since when, why a review is due (a
 * lapse, or how long it is overdue), where an open task was left, or
 * that the topic is next on the course's map. Engine fields only. Pure.
 */
export function whyOf(row: TodayRow, today: string): Why | null {
	if (row.kind === "session") {
		return { kind: "reply", words: row.chat.updatedAt.slice(0, 10) < today ? "Waiting since yesterday" : "Waiting for your reply", short: "Your turn" };
	}
	const { course, step } = row;
	switch (step.kind) {
		case "review": {
			const handles = new Set<string>(step.topics);
			return reviewReason(course.map.topics.filter((t) => handles.has(t.handle)));
		}
		case "task":
			return step.step
				? { kind: "task", words: `Left off at ${step.step.charAt(0).toLowerCase()}${step.step.slice(1)}`, short: `At ${step.step.charAt(0).toLowerCase()}${step.step.slice(1)}` }
				: { kind: "task", words: "Started, not finished", short: "Unfinished" };
		case "topic":
			return { kind: "next", words: "Next on your map", short: "Next up" };
		case "none":
			return null;
	}
}

/** `whyOf` as its full sentence. Pure. */
export function whyNow(row: TodayRow, today: string): string | null {
	return whyOf(row, today)?.words ?? null;
}

/** How long since the learner last studied a line's course, short enough
 *  for a trailing column: "Today", "Yesterday", "3d ago", "2w ago", "3mo
 *  ago"; null for a course never studied or a line with no course. Pure. */
export function studiedAgo(row: TodayRow): string | null {
	const days = row.course?.lastActiveDaysAgo;
	if (days === null || days === undefined) return null;
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 14) return `${days}d ago`;
	if (days < 60) return `${Math.floor(days / 7)}w ago`;
	return `${Math.floor(days / 30)}mo ago`;
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

/** The levels at which the learner can do a topic on their own: the
 *  engine's independent, retained and transferred. */
const ON_YOUR_OWN = new Set<CourseMapTopic["level"]>(["independent", "retained", "transferred"]);

/** How far along a course the learner is, as it matters before an exam:
 *  the topics they can do on their own (independent or better) that the
 *  engine does not call weak, of all the map's topics; null for an empty
 *  map. Pure. */
export function courseProgress(course: StudyCourse): { solid: number; of: number } | null {
	const of = course.map.topics.length;
	if (of === 0) return null;
	return { solid: course.map.topics.filter((t) => ON_YOUR_OWN.has(t.level) && !t.weak).length, of };
}
