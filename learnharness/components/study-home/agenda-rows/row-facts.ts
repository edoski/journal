import { courseLabel, type ChatListItem, type CourseMapTopic, type StartsWhy, type StudyCourse } from "@/src/core";
import { TUTOR_WRITING, agoWords, lapsedNow, lapsedOnWords, overdueWords, startsWhyShort, startsWhyTells, studiedDaysWords } from "@/components/study-words";
import { pausedWords, sessionState } from "@/components/nav/session-state";
import { continueWords, planDay, stepWords, type NextStep, type TodayRow } from "@/components/study-home/study-facts";
import { leftWords, taskWords } from "@/components/unit-inbox/units";
import { localDay } from "@/components/day-change";
import { sessionName } from "@/components/study-home/day-record";
import type { TakeLine } from "@/components/start/use-lesson-start";
import type { PointBy } from "@/components/course-map/use-map-tie";

/** What Today's rows draw from: Today's lines and how a line opens. */
export interface RowsProps {
	rows: readonly TodayRow[];
	busy: boolean;
	/** Take up a course line's step (`takeLine`). */
	onContinue: TakeLine;
	/** The line Home's map follows, and
	 *  where a line reports that he points at it (by pointer or focus) or
	 *  stops pointing. */
	pointed?: string | null;
	onPoint?: (row: TodayRow, by: PointBy) => void;
	onPointEnd?: (by: PointBy) => void;
}

/** The handlers and mark that let a line tell Home's map he points at it
 *  (pointer or focus) and stops; none when nothing follows. */
export function pointProps(row: TodayRow, { pointed, onPoint, onPointEnd }: Pick<RowsProps, "pointed" | "onPoint" | "onPointEnd">) {
	if (!onPoint) return {};
	return {
		"data-pointed": pointed === lineKey(row) || undefined,
		onPointerEnter: () => onPoint(row, "pointer"),
		onPointerLeave: () => onPointEnd?.("pointer"),
		onFocus: () => onPoint(row, "focus"),
		onBlur: () => onPointEnd?.("focus"),
	};
}

/** The line Home's map follows: the pointed line if it has a course; at
 *  rest, the line of the session he is in, or he last studied (the newest
 *  of `chats` on a course Today lists): that session's own line, else its
 *  course's first line (round 15, 3 free: mid Linear Algebra lesson, Home
 *  opened on Probability); else the first line with a course (Today's most
 *  urgent). Pure. */
export function followedRow(rows: readonly TodayRow[], pointed: string | null, chats: readonly ChatListItem[] = []): TodayRow | null {
	const withCourse = rows.filter((row) => row.course !== null);
	const found = withCourse.find((row) => lineKey(row) === pointed);
	if (found) return found;
	const listed = new Set(withCourse.map((row) => row.course!.map.workspace));
	const last = [...chats].filter((chat) => chat.course && listed.has(chat.course.workspace)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
	if (!last) return withCourse[0] ?? null;
	return (
		withCourse.find((row) => row.kind === "session" && row.chat.id === last.id) ??
		withCourse.find((row) => row.course!.map.workspace === last.course!.workspace) ??
		null
	);
}

/** At most this many lines; past it the last line names the other courses. */
export const MAX_LINES = 5;

/** Whether a line is a session he is in: it waits on him, the tutor
 *  writes in it or stopped mid-reply, and he last worked in it today. */
function inToday(row: TodayRow): boolean {
	if (row.kind !== "session" || !row.course) return false;
	const state = sessionState(row.chat);
	return (state === "your-turn" || state === "working" || state === "paused") && localDay(new Date(row.chat.updatedAt)) >= row.course.map.today;
}

/** Today's lines as shown: the first lines, then the first session he is
 *  in today that the fold would hide, as the last full line (round 11,
 *  3 n5: the lesson he had just left folded into "Also today:" below two
 *  sessions the seed dated later the same day), and the rest folded into
 *  the last line ("Also today"), so a lesson left on an earlier day still
 *  comes after the plan. At most MAX_LINES full lines and the fold, which
 *  still fit his window with the Studied today line. Pure. */
export function foldLines(rows: readonly TodayRow[]): { shown: readonly TodayRow[]; also: readonly TodayRow[] } {
	if (rows.length <= MAX_LINES) return { shown: rows, also: [] };
	const shown = [...rows.slice(0, MAX_LINES - 1), ...rows.slice(MAX_LINES - 1).filter(inToday).slice(0, 1)];
	return { shown, also: rows.filter((row) => !shown.includes(row)) };
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

/** A line's lesson in words: the session's one name (`sessionName`, the
 *  title of the task it holds), or the course's next step ("Review A, B").
 *  A lesson left for next time reads as the step it takes up: "Continue"
 *  and that name, the words the task's own line reads (round 10, 1 m5:
 *  "Also today: Continuity" had no verb). Pure. */
export function lessonTitle(row: TodayRow): string {
	if (row.kind === "course") return stepWords(row.step);
	const name = sessionName(row.chat, row.course?.map.tasks ?? []);
	return sessionState(row.chat) === "left" ? continueWords(name) : name;
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
function reviewReason(due: readonly CourseMapTopic[], today: string): Why | null {
	const lapsed = due.find((t) => lapsedNow(t.signals));
	if (lapsed) return { kind: "missed", short: lapsedOnWords(lapsed.title) };
	const overdue = Math.max(-1, ...due.map((t) => (t.review?.kind === "due" ? t.review.overdue : -1)));
	if (overdue < 0) return null;
	return { kind: "review", short: overdueWords(overdue, today) };
}

/** A session's line by where it stands; a finished session has no line. */
const SESSION_WHY: Record<ReturnType<typeof sessionState>, (row: TodayRow & { kind: "session" }) => Why | null> = {
	"your-turn": () => ({ kind: "reply", short: "Your turn" }),
	working: () => ({ kind: "working", short: TUTOR_WRITING }),
	paused: (row) => ({ kind: "stopped", short: pausedWords(row.chat) }),
	left: (row) => ({ kind: "task", short: leftWords(row.chat, row.course?.map.today ?? localDay(new Date())) }),
	finished: () => null,
};

/**
 * Why a line is on Today, in words that need no memory of the system: a
 * session waiting on the learner, the tutor writing in it, stopped
 * mid-reply in it or left for next time, why a review is due (a lapse, or how
 * long it is overdue), when an open task was left, that the topic is
 * next on the course's map (why the plan starts a new topic now: "Next in
 * Matrices", "After Expectation, which it needs", cut to "After
 * Expectation", which Home's row shows when it fits; never "Early" on the
 * plan's own start, which would read as a warning, round 9),
 * or the day the plan dates its next item
 * ("Planned Sun 15 Nov", the course page's line when nothing is today). Engine fields only, never the tutor's prose.
 * Pure.
 */
export function whyOf(row: TodayRow): Why | null {
	if (row.kind === "session") {
		return SESSION_WHY[sessionState(row.chat)](row);
	}
	const { course, step } = row;
	switch (step.kind) {
		case "review": {
			if (step.on) return { kind: "review", short: `Planned ${planDay(step.on)}` };
			const handles = new Set<string>(step.topics);
			return reviewReason(course.map.topics.filter((t) => handles.has(t.handle)), course.map.today);
		}
		case "task":
			return { kind: "task", short: taskWords(step, course.map.today) };
		case "topic": {
			if (step.on) return { kind: "next", short: `Planned ${planDay(step.on)}` };
			const short = step.planned ? "Planned today" : "Next up";
			const why = step.fresh ? course.map.topics.find((t) => t.handle === step.topics[0])?.startsWhy : undefined;
			const early = step.planned && why?.kind === "early";
			return why && startsWhyTells(why) && !early ? { kind: "next", short, starts: { kind: why.kind, words: startsWhyShort(why, course.map) } } : { kind: "next", short };
		}
		case "none":
			return null;
	}
}

/** Some days ago in Home's words, the app's one form (`study-words.ts`). */
export { agoWords };

/** When the learner last studied a line's course, in words: "Studied
 *  today", "Studied 4 Nov", or "Not studied yet"; null for a line with no
 *  course. Pure. */
export function lastStudied(row: TodayRow): string | null {
	const days = row.course?.lastActiveDaysAgo;
	if (row.course === null || days === undefined) return null;
	if (days === null) return "Not studied yet";
	return studiedDaysWords(days, row.course.map.today);
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
