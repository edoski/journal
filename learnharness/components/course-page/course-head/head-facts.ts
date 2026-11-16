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
 *  once, in topic order (`why`). `ways` is what he can take up today, in
 *  the order Home and the tutor take it: first today's plan for the course,
 *  its reviews then its starts (`planned`; round 11, 1 N10: the head picked
 *  "Review Conditional probability today" while Home and the tutor began
 *  with Binomial), then the topics left out: review a taught topic, start
 *  one whose prerequisites are all taught; a topic that needs one not
 *  taught yet offers nothing. Of those, reviews come first: a taught topic
 *  checked before the exam counts there, a start that does not fit will
 *  not be solid in time (round 10, 1 m6: the head picked "Start Poisson
 *  distribution today" while the tutor put Poisson last). Null with no exam
 *  ahead or nothing left out. Pure. */
export interface ExamGaps {
	start: readonly CourseMapTopic[];
	review: readonly CourseMapTopic[];
	why: { start: readonly ExamGapReason[]; review: readonly ExamGapReason[] };
	ways: readonly { topic: CourseMapTopic; starts: boolean; planned: boolean }[];
}

export function examGaps(map: Pick<CourseMap, "exam" | "topics" | "edges" | "today">): ExamGaps | null {
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
	const today = [
		...map.topics.filter((t) => t.review?.kind === "due").map((topic) => ({ topic, starts: false, planned: true })),
		...map.topics.filter((t) => t.starts === map.today).map((topic) => ({ topic, starts: true, planned: true })),
	];
	const left = [...start, ...review]
		.filter((topic) => !today.some((way) => way.topic.handle === topic.handle))
		.flatMap((topic) => (topic.introduced !== null ? [{ topic, starts: false, planned: false }] : startable(topic) ? [{ topic, starts: true, planned: false }] : []))
		.sort((a, b) => Number(a.starts) - Number(b.starts));
	const ways = [...today, ...left];
	return start.length > 0 || review.length > 0 ? { start, review, why: { start: why(start), review: why(review) }, ways } : null;
}

/** His latest session in the course, the one "Studied" opens. */
export function lastSessionOf(workspace: string, chats: readonly ChatListItem[]): { id: string; title: string } | null {
	const mine = chats.filter((c) => c.course?.workspace === workspace).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return mine[0] ? { id: mine[0].id, title: mine[0].title } : null;
}
