import { courseLabel, type ChatListItem, type StudyCourse } from "@/src/core";
import { localDay } from "@/components/day-change";
import { pastSessionWords } from "@/components/study-words";

/**
 * What he studied today, from the session records (spec: today.md, "A day
 * of study"): every session he worked in whose last turn fell on today's
 * date by the learner's clock, the day ending at midnight (`localDay`, the
 * rule `useDayChange` rereads Home on), oldest first, whatever it stands at
 * now: one he closed, one he ended with Done for today, one still waiting
 * on him. Round 4 found a 40-minute lesson missing because it ended with
 * Done for today. A session he only opened, with no answer and nothing he
 * wrote after its opening, is not study (`studied`; round 10, 1 m2: a
 * plan question and Problem sheet 4's opening were listed). Each is named as the sidebar names it, by its title,
 * or by the title of the open task it holds (`courses`' tasks), and each
 * name once, so two sessions of one lesson read as one (round 11, 1 N9:
 * "Eigenvalues and eigenvectors, Eigenvalues lesson: eigenvectors step");
 * a title a session in another course shares ("Review") carries its
 * course too ("Review in Linear Algebra"), the way the sidebar's row
 * carries its course's mark. Pure.
 */
export function doneToday(chats: readonly ChatListItem[], now: Date, courses: readonly StudyCourse[] = []): string[] {
	const today = localDay(now);
	const title = (chat: ChatListItem) => sessionName(chat, courses.find((c) => c.map.workspace === chat.course?.workspace)?.map.tasks ?? []);
	const name = (chat: ChatListItem) => title(chat).trim().toLowerCase();
	const shared = new Map<string, Set<string>>();
	for (const chat of chats) shared.set(name(chat), (shared.get(name(chat)) ?? new Set()).add(chat.course?.workspace ?? ""));
	const named = chats
		.filter((chat) => chat.studied === true && localDay(new Date(chat.updatedAt)) === today)
		.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0))
		.map((chat) => (shared.get(name(chat))!.size > 1 && chat.course ? `${title(chat)} in ${courseLabel(chat.course)}` : title(chat)));
	return [...new Set(named)];
}

/** A session's one name, wherever Home names it (round 14, m29: "Problem
 *  sheet 4" on its line while it waited, "Problem sheet 4: rank and
 *  nullity" once left and in Studied today): the title of the open task it
 *  holds (`tasks`, its course's), so two sessions of one lesson read as one
 *  (round 11, 1 N9), else the title it gave its task once that task closed,
 *  so it reads one way all day (round 13, 1 n9), else its own. Pure. */
export function sessionName(chat: ChatListItem, tasks: ReadonlyArray<{ key: string; title: string }>): string {
	const held = new Set(chat.tasks ?? []);
	return tasks.find((t) => held.has(t.key))?.title ?? chat.taskTitle ?? chat.title;
}

/** The part of the learner's day an hour falls in, in words: "this
 *  morning", "this afternoon", else "today" (he studies in the daytime,
 *  until about 6pm; never "tonight" or "this evening"). Pure. */
function partOfDay(hour: number): string {
	if (hour >= 5 && hour < 12) return "this morning";
	if (hour >= 12 && hour < 18) return "this afternoon";
	return "today";
}

/** An exam close enough for Home's heading to name: within the coming
 *  week, so its weekday names one day. */
export interface NearExam {
	course: string;
	/** The exam's date, YYYY-MM-DD. */
	date: string;
	/** Days from the engine's today: 0 is today. */
	daysLeft: number;
	/** The course's workspace, for Ask the tutor. */
	workspace?: string;
	/** The titles of the topics its plan has no room to start before the
	 *  exam (the engine's `does_not_fit`), in the plan's order (round 17,
	 *  M2). */
	wontFit?: readonly string[];
	/** Of `wontFit`, the topics that fell past the exam today: the plan
	 *  gave each a start before the exam as yesterday ended (the engine's
	 *  `moved`, `from`). */
	fellToday?: readonly string[];
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });

/** The days in which a weekday names one day: today and the six after it. */
const ONE_WEEK = 7;

/** The nearest exam ahead within the coming week, or null: the one Home's
 *  heading names (round 8: nothing on Home said the Probability exam was
 *  two days away). Pure. */
export function nearExam(exams: readonly NearExam[]): NearExam | null {
	return [...exams].filter((e) => e.daysLeft >= 0 && e.daysLeft < ONE_WEEK).sort((a, b) => a.daysLeft - b.daysLeft)[0] ?? null;
}

/** Each course's exam ahead as Home names it, with the topics its plan has
 *  no room to start before it and those of them that fell past it today:
 *  the plan gave each a start before the exam as yesterday ended (the
 *  engine's `moved`). Pure. */
export function homeExams(courses: readonly StudyCourse[]): NearExam[] {
	return courses.flatMap(({ map }) => {
		if (!map.exam) return [];
		const { date, daysLeft, doesNotFit = [] } = map.exam;
		const misfits = doesNotFit.flatMap((h) => map.topics.find((t) => t.handle === h) ?? []);
		const fell = misfits.filter((t) => t.moved !== undefined && t.moved.from < date);
		return [{ course: map.title, date, daysLeft, workspace: map.workspace, wontFit: misfits.map((t) => t.title), fellToday: fell.map((t) => t.title) }];
	});
}

/** Home's ask on an exam session gone by: the course, and the words that
 *  say what moved the plan and ask how it went (`pastSessionWords`). */
export interface SessionAsk {
	workspace: string;
	words: string;
}

/** Each course's exam session gone by with no word from him yet, which
 *  Home asks about until he answers. Pure. */
export function sessionAsks(courses: readonly StudyCourse[]): SessionAsk[] {
	return courses.flatMap(({ map }) => {
		const words = map.exam ? pastSessionWords(map.title, map.exam) : null;
		return words ? [{ workspace: map.workspace, words }] : [];
	});
}

/** The exam whose topics with no room before it Home names under its
 *  heading: the coming week's (`nearExam`) while any does not fit, else on
 *  the day a topic falls past an exam further off, the nearest such exam,
 *  so he learns of it the day it happens, not in the exam's last week
 *  (round 18, M1: three exam topics fell past the exam overnight on 9 Nov,
 *  and Home said nothing until 17 Nov). Pure. */
export function misfitExam(exams: readonly NearExam[]): NearExam | null {
	const near = nearExam(exams);
	if (near?.wontFit?.length) return near;
	return [...exams].filter((e) => e.daysLeft >= 0 && (e.fellToday?.length ?? 0) > 0).sort((a, b) => a.daysLeft - b.daysLeft)[0] ?? null;
}

/** Whose exam, by its day: "today's Probability exam", "tomorrow's",
 *  "Thursday's". Pure. */
function examWords(exam: NearExam): string {
	const day = exam.daysLeft === 0 ? "today's" : exam.daysLeft === 1 ? "tomorrow's" : `${WEEKDAY.format(new Date(`${exam.date}T00:00:00Z`))}'s`;
	return `${day} ${exam.course} exam`;
}

/** Home's heading, one question for the hour (Edo, 13 Nov 2026: dynamic,
 *  never the date): "What are we studying this morning?", or once he has
 *  studied something today, "What else are we studying this morning?".
 *  With an exam in the coming week it asks for that exam instead, by its
 *  day: "What are we studying for Thursday's Probability exam?". Pure. */
export function dayQuestion(hour: number, studied: boolean, exam: NearExam | null = null): string {
	const what = `What ${studied ? "else " : ""}are we studying`;
	if (exam) return `${what} ${exam.daysLeft === 0 ? "before" : "for"} ${examWords(exam)}?`;
	return `${what} ${partOfDay(hour)}?`;
}

/** Home's heading when Today holds nothing: a statement, never a question
 *  with nothing under it (round 8: closing every lesson left "What are we
 *  studying today?" above an empty list). Pure. */
export function nothingTodayWords(studied: boolean): string {
	return studied ? "Nothing else is planned today" : "Nothing is planned today";
}

/** The line under the heading that says what he studied today, by name
 *  and never by count: "Studied today: Eigenvalues and eigenvectors, Rank
 *  practice"; null before he has studied anything. "Studied", not "Done":
 *  a lesson he worked in may still wait on him. Pure. */
export function doneWords(done: readonly string[]): string | null {
	return done.length > 0 ? `Studied today: ${done.join(", ")}` : null;
}
