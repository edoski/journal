import { courseLabel, type ChatListItem, type StudyCourse } from "@/src/core";
import { localDay } from "@/components/day-change";

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
	const tasks = new Map(courses.flatMap((course) => course.map.tasks.map((task) => [`${course.map.workspace}#${task.key}`, task.title] as const)));
	// A session holding an open task is named by it, so two sessions of one lesson read as one (round 11, 1 N9), and
	// by the title it gave its task once that task closed, so it reads one way all day (round 13, 1 n9).
	const title = (chat: ChatListItem) => (chat.tasks ?? []).map((key) => tasks.get(`${chat.course?.workspace}#${key}`)).find((t) => t !== undefined) ?? chat.taskTitle ?? chat.title;
	const name = (chat: ChatListItem) => title(chat).trim().toLowerCase();
	const shared = new Map<string, Set<string>>();
	for (const chat of chats) shared.set(name(chat), (shared.get(name(chat)) ?? new Set()).add(chat.course?.workspace ?? ""));
	const named = chats
		.filter((chat) => chat.studied === true && localDay(new Date(chat.updatedAt)) === today)
		.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0))
		.map((chat) => (shared.get(name(chat))!.size > 1 && chat.course ? `${title(chat)} in ${courseLabel(chat.course)}` : title(chat)));
	return [...new Set(named)];
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
