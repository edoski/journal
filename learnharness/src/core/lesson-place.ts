/**
 * Where a lesson sits in its course (components/lesson/lesson-roadmap.md):
 * the topic it belongs to and that topic's arc, read from the course map
 * once when the lesson opens. The steps and where he is on them come from
 * the transcript, live; this is only what the transcript cannot say. Pure.
 */

import { currentArc } from "./contracts/course-arcs.ts";
import type { CourseMap } from "./contracts/course-map.ts";

export interface LessonPlace {
	/** The topic the lesson belongs to, as the course map names it; null
	 *  when the lesson has no topic or the map does not list it. */
	topic: { handle: string; title: string } | null;
	/** The topic's arc, in a course with arcs; null otherwise. */
	arc: { title: string } | null;
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
	const arc = arcHandle ? (map.arcs ?? []).find((a) => a.handle === arcHandle) : undefined;
	return { topic: { handle: topic.handle, title: topic.title }, arc: arc ? { title: arc.title } : null };
}
