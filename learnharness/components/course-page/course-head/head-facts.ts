import type { ChatListItem, CourseMap, CourseMapTopic, TopicHandle } from "@/src/core";

/**
 * The course page head's facts (spec: course-head.md), each a
 * few words from the engine's own fields: its course map and the
 * sessions. The app computes no standing. Pure.
 */

/** "A, B and C": every name, never "and others", so a line says every
 *  topic it means (round 6: "and others" hid five not-yet-solid topics). */
export function namesWords(names: readonly string[]): string {
	return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
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

/** His latest session in the course, the one "Studied" opens. */
export function lastSessionOf(workspace: string, chats: readonly ChatListItem[]): { id: string; title: string } | null {
	const mine = chats.filter((c) => c.course?.workspace === workspace).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return mine[0] ? { id: mine[0].id, title: mine[0].title } : null;
}
