import type { CalendarCourse, ChatListItem, StudyCourse, TopicHandle } from "@/src/core";
import { misfitWords } from "@/components/calendar/calendar-facts";
import { daysBetween } from "@/components/unit-inbox/units";

/**
 * The course page head candidates' facts (spec: course-head.md), each a
 * few words from the engine's own fields: its daily plan (`plan`, read
 * with the calendar), its run-up, its course map. The app computes no
 * standing. Pure.
 */

/** "A, B and C"; past three names, "A, B, C and others". */
export function namesWords(names: readonly string[]): string {
	if (names.length > 3) return `${names.slice(0, 3).join(", ")} and others`;
	return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Whether the course is on course for its exam, from the engine's plan:
 *  topics it has no room to start before the exam (`short`), inside the
 *  run-up the topics it counts not recently solid (`unready`), every
 *  topic already started (`started`), or every topic placed before the
 *  exam (`fits`). Null with no exam ahead or before the plan is read. */
export type Pace = { kind: "short" | "unready" | "started" | "fits"; words: string };

export function paceOf(course: StudyCourse, planned: Pick<CalendarCourse, "doesNotFit"> | null): Pace | null {
	const { map } = course;
	if (!map.exam || map.exam.daysLeft < 0 || !planned) return null;
	const titleOf = (handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle;
	if (planned.doesNotFit.length > 0) return { kind: "short", words: misfitWords(planned.doesNotFit.map(titleOf))! };
	if (course.unready && course.unready.length > 0) return { kind: "unready", words: `Not yet solid for the exam: ${namesWords(course.unready.map(titleOf))}` };
	return untaughtLeft(course) ? { kind: "fits", words: "Every topic fits before the exam" } : { kind: "started", words: "Every topic started" };
}

/** Whether a topic the course keeps is still untaught. */
export const untaughtLeft = (course: StudyCourse): boolean => course.map.topics.some((t) => t.introduced === null && !t.excluded);

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** A day ahead as a sentence ends with it: "today", "tomorrow", a
 *  weekday within the week ("on Thursday"), else the date ("on 2 Dec"). */
export function aheadWords(day: string, today: string): string {
	const days = daysBetween(today, day);
	const date = new Date(`${day}T00:00:00Z`);
	if (days <= 0) return "today";
	if (days === 1) return "tomorrow";
	return `on ${days < 7 ? WEEKDAY.format(date) : SHORT.format(date)}`;
}

/** The next day after today the plan starts new topics, and their titles. */
export function nextStartOf(course: StudyCourse, planned: Pick<CalendarCourse, "planned"> | null): { day: string; titles: string[] } | null {
	const { map } = course;
	const day = planned?.planned.find((d) => d.date > map.today && d.new.length > 0 && (!map.exam || d.date < map.exam.date));
	if (!day) return null;
	return { day: day.date, titles: day.new.map((h) => map.topics.find((t) => t.handle === h)?.title ?? h) };
}

/** His latest session in the course, the one "Studied" opens. */
export function lastSessionOf(workspace: string, chats: readonly ChatListItem[]): { id: string; title: string } | null {
	const mine = chats.filter((c) => c.course?.workspace === workspace).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return mine[0] ? { id: mine[0].id, title: mine[0].title } : null;
}
