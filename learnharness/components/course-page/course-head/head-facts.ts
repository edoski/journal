import type { CalendarCourse, ChatListItem, CourseMap, CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";
import { misfitWords } from "@/components/calendar/calendar-facts";
import { finalReviewMissWords } from "@/components/study-words";

/**
 * The course page head's facts (spec: course-head.md), each a
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
 *  topics it has no room to start before the exam, else taught topics its
 *  final review has no room for (`short`), inside the
 *  run-up the topics it counts not recently solid (`unready`), every
 *  topic already started (`started`), or every topic placed before the
 *  exam (`fits`). Null with no exam ahead or before the plan is read. */
export type Pace = { kind: "short" | "unready" | "started" | "fits"; words: string };

export function paceOf(course: StudyCourse, planned: Pick<CalendarCourse, "doesNotFit"> | null): Pace | null {
	const { map } = course;
	if (!map.exam || map.exam.daysLeft < 0 || !planned) return null;
	const titleOf = (handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle;
	if (planned.doesNotFit.length > 0) return { kind: "short", words: misfitWords(planned.doesNotFit.map(titleOf))! };
	if (map.exam.unreviewed?.length) return { kind: "short", words: finalReviewMissWords(map.exam.unreviewed.map(titleOf)) };
	if (course.unready && course.unready.length > 0) return { kind: "unready", words: `Not yet solid for the exam: ${namesWords(course.unready.map(titleOf))}` };
	return untaughtLeft(course) ? { kind: "fits", words: "Every topic fits before the exam" } : { kind: "started", words: "Every topic started" };
}

/** What the exam's plan leaves out, as the engine's `map` says it: the
 *  topics it has no room to start before the exam (`doesNotFit`), and the
 *  taught ones its final review has no room for (`unreviewed`). Null with
 *  no exam ahead or nothing left out. Pure. */
export interface ExamGaps {
	start: readonly CourseMapTopic[];
	review: readonly CourseMapTopic[];
}

export function examGaps(map: Pick<CourseMap, "exam" | "topics">): ExamGaps | null {
	const { exam } = map;
	if (!exam || exam.daysLeft < 0) return null;
	const topicsOf = (handles: readonly TopicHandle[] = []) =>
		handles.flatMap((handle) => {
			const topic = map.topics.find((t) => t.handle === handle);
			return topic && topic.excluded === undefined ? [topic] : [];
		});
	const start = topicsOf(exam.doesNotFit);
	const review = topicsOf(exam.unreviewed);
	return start.length > 0 || review.length > 0 ? { start, review } : null;
}

/** Whether a topic the course keeps is still untaught. */
export const untaughtLeft = (course: StudyCourse): boolean => course.map.topics.some((t) => t.introduced === null && !t.excluded);

/** His latest session in the course, the one "Studied" opens. */
export function lastSessionOf(workspace: string, chats: readonly ChatListItem[]): { id: string; title: string } | null {
	const mine = chats.filter((c) => c.course?.workspace === workspace).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return mine[0] ? { id: mine[0].id, title: mine[0].title } : null;
}
