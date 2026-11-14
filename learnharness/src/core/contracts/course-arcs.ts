/**
 * Arcs: a course's ordered, self-contained groups of topics, like a
 * textbook's chapters, as the learning engine's `map` reports them. An
 * arc's standing is the engine's, derived on every read; the app computes
 * none of it.
 */

import type { CourseExam, CourseMap, CourseMapTopic, TopicHandle } from "./course-map.ts";

/** An engine arc key, verbatim. */
export type ArcHandle = string & { readonly __arc: unique symbol };

/** The engine's arc states, word for word (learning/arcs.py `standing`).
 *  `taught` is only a course that takes no questions; `ready` and
 *  `checked` never occur there. */
export const ARC_STATES = ["new", "learning", "ready", "checked", "taught"] as const;
export type ArcState = (typeof ARC_STATES)[number];

export function isArcState(value: unknown): value is ArcState {
	return (ARC_STATES as readonly unknown[]).includes(value);
}

export interface CourseMapArc {
	handle: ArcHandle;
	title: string;
	state: ArcState;
	/** Its prerequisites from earlier arcs, lapsed first: what its first
	 *  lesson recalls. */
	entry: readonly TopicHandle[];
}

/** Where he is: the arc of the topic "You are here" names (`map.current`,
 *  which Home moves to the lesson in progress), else the engine's own
 *  answer. The one definition the course page, Home, the sidebar and the
 *  topic page read. Null for a course without arcs. Pure. */
export function currentArc(map: Pick<CourseMap, "current" | "topics" | "currentArc">): ArcHandle | null {
	const here = map.current === null ? undefined : map.topics.find((t) => t.handle === map.current);
	if (here?.arc && here.excluded === undefined) return here.arc;
	return map.currentArc ?? null;
}

/** How much of an arc the next exam examines: null with no exam, so
 *  nothing on screen mentions one; `all` when the exam is over the whole
 *  course or over the arc whole; `part` when it leaves some of the arc's
 *  topics out; `none` when it examines none of them. Pure. */
export function examCovers(exam: CourseExam | null, arc: CourseMapArc, topics: readonly CourseMapTopic[]): "all" | "part" | "none" | null {
	if (!exam) return null;
	if (!exam.arcs) return "all";
	if (!exam.arcs.includes(arc.handle)) return "none";
	const live = topics.filter((t) => t.arc === arc.handle && t.excluded === undefined);
	const examined = live.filter((t) => !exam.leavesOut?.includes(t.handle));
	if (examined.length === 0) return "none";
	return examined.length < live.length ? "part" : "all";
}
