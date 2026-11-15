import { courseLabel, type CourseMapTopic, type StartsWhy, type StudyCourse } from "@/src/core";
import { LESSON_WORDS, TUTOR_WRITING, agoWords, lapsedNow, lapsedOnWords, overdueWords, startsWhyShort, startsWhyTells, studiedAgoWords, studiedDaysWords } from "@/components/study-words";
import { sessionState } from "@/components/nav/session-state";
import { planDay, stepWords, type NextStep, type TodayRow } from "@/components/study-home/study-facts";
import { taskWords } from "@/components/unit-inbox/units";

/** What Today's rows draw from: Today's lines and how a line opens. */
export interface RowsProps {
	rows: readonly TodayRow[];
	busy: boolean;
	/** Take up a course line's step (`courseMove`). */
	onContinue: (workspace: string, step?: NextStep) => void;
	/** The line Home's map follows, and
	 *  where a line reports that he points at it (by pointer or focus) or
	 *  stops pointing. */
	pointed?: string | null;
	onPoint?: (row: TodayRow, by: "pointer" | "focus") => void;
	onPointEnd?: () => void;
}

/** The handlers and mark that let a line tell Home's map he points at it
 *  (pointer or focus) and stops; none when nothing follows. */
export function pointProps(row: TodayRow, { pointed, onPoint, onPointEnd }: Pick<RowsProps, "pointed" | "onPoint" | "onPointEnd">) {
	if (!onPoint) return {};
	return {
		"data-pointed": pointed === lineKey(row) || undefined,
		onPointerEnter: () => onPoint(row, "pointer"),
		onPointerLeave: onPointEnd,
		onFocus: () => onPoint(row, "focus"),
		onBlur: onPointEnd,
	};
}

/** The line Home's map follows: the pointed line if it has a course, else
 *  the first line with one (Today's most urgent). Pure. */
export function followedRow(rows: readonly TodayRow[], pointed: string | null): TodayRow | null {
	const withCourse = rows.filter((row) => row.course !== null);
	return withCourse.find((row) => lineKey(row) === pointed) ?? withCourse[0] ?? null;
}

/** At most this many lines; past it the last line names the other courses. */
export const MAX_LINES = 5;

/** Today's lines as shown: the first lines, and the courses folded into
 *  the last one ("Also today"). Pure. */
export function foldLines(rows: readonly TodayRow[]): { shown: readonly TodayRow[]; also: readonly TodayRow[] } {
	const shown = rows.length > MAX_LINES ? rows.slice(0, MAX_LINES - 1) : rows;
	return { shown, also: rows.slice(shown.length) };
}

/** The key React keeps a line by: a session's id, else its course and
 *  step, since a course may have a line for its review, each open task and
 *  today's new topics. Pure. */
export function lineKey(row: TodayRow): string {
	if (row.kind === "session") return row.chat.id;
	const { step } = row;
	const which = step.kind === "task" ? `task:${step.key}` : step.kind === "none" ? "none" : `${step.kind}:${step.topics.join(",")}`;
	return `${row.course.map.workspace}#${which}`;
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

/** Why a line is on Today: its kind (which picks its icon) and the few
 *  words that fit beside an icon. */
export interface Why {
	kind: "reply" | "working" | "stopped" | "missed" | "review" | "task" | "next";
	/** "Not right last time: Chain rule". */
	short: string;
	/** For a new topic, why the plan starts it now
	 *  in a few words (the engine's `starts_why`, `startsWhyShort`) and its
	 *  kind, which picks its own icon. Home's row shows it in place of
	 *  `short` only when it fits on one line; the sidebar keeps `short`. */
	starts?: { kind: StartsWhy["kind"]; words: string };
}

/** A review's reason from the engine's own fields: a lapse first (the
 *  topic it was), else how overdue the most overdue one is. Pure. */
function reviewReason(due: readonly CourseMapTopic[]): Why | null {
	const lapsed = due.find((t) => lapsedNow(t.signals));
	if (lapsed) return { kind: "missed", short: lapsedOnWords(lapsed.title) };
	const overdue = Math.max(-1, ...due.map((t) => (t.review?.kind === "due" ? t.review.overdue : -1)));
	if (overdue < 0) return null;
	return { kind: "review", short: overdueWords(overdue) };
}

/** A session's line by where it stands; a finished session has no line. */
const SESSION_WHY: Record<ReturnType<typeof sessionState>, Why | null> = {
	"your-turn": { kind: "reply", short: "Your turn" },
	working: { kind: "working", short: TUTOR_WRITING },
	paused: { kind: "stopped", short: "Reply cut off" },
	left: { kind: "task", short: LESSON_WORDS.leftForTonight },
	finished: null,
};

/**
 * Why a line is on Today, in words that need no memory of the system: a
 * session waiting on the learner, the tutor writing in it, stopped
 * mid-reply in it or left for next time, why a review is due (a lapse, or how
 * long it is overdue), when an open task was left, that the topic is
 * next on the course's map (why the plan starts a new topic now: "Next in
 * Matrices", "After Expectation, which it needs", cut to "After
 * Expectation", which Home's row shows when it fits),
 * or the day the plan dates its next item
 * ("Planned Sun 15 Nov", the course page's line when nothing is today). Engine fields only, never the tutor's prose.
 * Pure.
 */
export function whyOf(row: TodayRow): Why | null {
	if (row.kind === "session") return SESSION_WHY[sessionState(row.chat)];
	const { course, step } = row;
	switch (step.kind) {
		case "review": {
			if (step.on) return { kind: "review", short: `Planned ${planDay(step.on)}` };
			const handles = new Set<string>(step.topics);
			return reviewReason(course.map.topics.filter((t) => handles.has(t.handle)));
		}
		case "task":
			return { kind: "task", short: taskWords(step, course.map.today) };
		case "topic": {
			if (step.on) return { kind: "next", short: `Planned ${planDay(step.on)}` };
			const short = step.planned ? "Planned today" : "Next up";
			const why = step.fresh ? course.map.topics.find((t) => t.handle === step.topics[0])?.startsWhy : undefined;
			return why && startsWhyTells(why) ? { kind: "next", short, starts: { kind: why.kind, words: startsWhyShort(why, course.map) } } : { kind: "next", short };
		}
		case "none":
			return null;
	}
}

/** The days since the line's one clock: a session's line, since he last
 *  wrote in that session, so one started minutes ago is 0; a course's
 *  line, since he last studied the course; an open task's line has none,
 *  since its reason already dates it ("Left off 2d ago"), so a row never
 *  shows two days at once. Null for a course never studied or a line with
 *  no course. Pure. */
function studiedDays(row: TodayRow): number | null {
	if (row.kind === "session") {
		const today = row.course?.map.today;
		if (!today) return null;
		const at = new Date(row.chat.updatedAt);
		const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
		return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000));
	}
	if (row.step.kind === "task") return null;
	return row.course.lastActiveDaysAgo;
}

/** The line's one clock, short enough for a trailing column: "Today",
 *  "Yesterday", "3d ago", "40d ago" (`studiedDays`). Pure. */
export function studiedAgo(row: TodayRow): string | null {
	const days = studiedDays(row);
	return days === null ? null : agoWords(days);
}

/** Some days ago in Home's words, the app's one form (`study-words.ts`). */
export { agoWords };

/** What Home's row shows of its clock, labelled: "Studied 7d ago" beside
 *  the course, so it never reads as the line's reason ("7d ago · Planned
 *  today", round 8). Null where `studiedAgo` is. Pure. */
export function studiedLabel(row: TodayRow): string | null {
	const days = studiedDays(row);
	return days === null ? null : studiedAgoWords(days);
}

/** When the learner last studied a line's course, in words: "Studied
 *  today", "Studied 3 days ago", "Studied 20 days ago", or "Not studied
 *  yet"; null for a line with no course. Pure. */
export function lastStudied(row: TodayRow): string | null {
	const days = row.course?.lastActiveDaysAgo;
	if (row.course === null || days === undefined) return null;
	if (days === null) return "Not studied yet";
	return studiedDaysWords(days);
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
