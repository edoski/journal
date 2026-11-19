/**
 * Where a lesson sits in its course (components/lesson/lesson-roadmap.md):
 * the topic it belongs to and that topic's arc, read from the course map
 * once when the lesson opens. The steps and where he is on them come from
 * the transcript, live; this is only what the transcript cannot say. Pure.
 */

import { currentArc, namedArc, type NamedArc } from "./contracts/course-arcs.ts";
import type { CourseMap } from "./contracts/course-map.ts";
import { sessionTasksOf, type ContinuedTask, type LhMessage } from "./native-messages.ts";

export interface LessonPlace {
	/** The topic the lesson belongs to, as the course map names it; null
	 *  when the lesson has no topic or the map does not list it. */
	topic: { handle: string; title: string } | null;
	/** The topic's arc, in a course with arcs; null otherwise. */
	arc: NamedArc | null;
	/** The open task the session holds, as the map names it, for its
	 *  Continue (`continuedTaskOf`); absent when the page read none. */
	task?: ContinuedTask | null;
}

/** The open task a session holds, as the course map names it: the first
 *  of the session's open tasks the map lists, with its title and the step
 *  he left it at. Null when the map lists none of them. Pure. */
export function continuedTaskOf(map: Pick<CourseMap, "tasks"> | undefined, messages: readonly LhMessage[]): ContinuedTask | null {
	if (!map) return null;
	const task = sessionTasksOf(messages).map((key) => map.tasks.find((t) => t.key === key)).find((t) => t !== undefined);
	return task ? { title: task.title, step: task.step } : null;
}

/** The lesson's place: the first of its candidate topics the map lists
 *  (`topics`: those it was started on first, then those its transcript
 *  worked on), and that topic's arc. A
 *  lesson with no listed topic has no arc either, never the course's
 *  current one: the bar names only what is true of this lesson. */
export function lessonPlaceOf(map: Pick<CourseMap, "topics" | "arcs" | "current" | "currentArc">, topics: readonly string[] | undefined): LessonPlace {
	const topic = (topics ?? []).map((handle) => map.topics.find((t) => t.handle === handle)).find((t) => t !== undefined);
	if (!topic) return { topic: null, arc: null };
	const arcHandle = topic.arc ?? (map.current === topic.handle ? currentArc(map) : null);
	return { topic: { handle: topic.handle, title: topic.title }, arc: arcHandle ? namedArc(map.arcs ?? [], arcHandle) : null };
}
