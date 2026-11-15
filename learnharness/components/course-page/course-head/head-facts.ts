import type { ChatListItem, CourseMap, CourseMapTopic, ExamGapReason, TopicHandle } from "@/src/core";

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
 *  topics it has no room to start before the exam (`doesNotFit`), the
 *  ones its final review has no room for (`unreviewed`: taught, or started
 *  too late for a review), and the engine's reasons for each list, each
 *  once, in topic order (`why`). `ways` is what he can do about each today:
 *  review a taught topic, start one whose prerequisites are all taught; a
 *  topic that needs one not taught yet offers nothing. Null with no exam
 *  ahead or nothing left out. Pure. */
export interface ExamGaps {
	start: readonly CourseMapTopic[];
	review: readonly CourseMapTopic[];
	why: { start: readonly ExamGapReason[]; review: readonly ExamGapReason[] };
	ways: readonly { topic: CourseMapTopic; starts: boolean }[];
}

export function examGaps(map: Pick<CourseMap, "exam" | "topics" | "edges">): ExamGaps | null {
	const { exam } = map;
	if (!exam || exam.daysLeft < 0) return null;
	const topicsOf = (handles: readonly TopicHandle[] = []) =>
		handles.flatMap((handle) => {
			const topic = map.topics.find((t) => t.handle === handle);
			return topic && topic.excluded === undefined ? [topic] : [];
		});
	const start = topicsOf(exam.doesNotFit);
	const review = topicsOf(exam.unreviewed);
	const why = (topics: readonly CourseMapTopic[]) => [...new Set(topics.flatMap((t) => exam.reasons?.[t.handle] ?? []))];
	const taught = (handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.introduced != null;
	const startable = (topic: CourseMapTopic) => map.edges.every((edge) => edge.kind !== "needs" || edge.topic !== topic.handle || taught(edge.prerequisite));
	const ways = [...start, ...review].flatMap((topic) => (topic.introduced !== null ? [{ topic, starts: false }] : startable(topic) ? [{ topic, starts: true }] : []));
	return start.length > 0 || review.length > 0 ? { start, review, why: { start: why(start), review: why(review) }, ways } : null;
}

/** His latest session in the course, the one "Studied" opens. */
export function lastSessionOf(workspace: string, chats: readonly ChatListItem[]): { id: string; title: string } | null {
	const mine = chats.filter((c) => c.course?.workspace === workspace).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return mine[0] ? { id: mine[0].id, title: mine[0].title } : null;
}
