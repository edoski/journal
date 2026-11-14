import type { CourseMapEdge, CourseMapTopic, PlanNodeStatus, SessionPlan, TopicHandle } from "@/src/core";
import { layoutTopicMap, WHOLE_COURSE_ZOOM, type Camera, type NodeSize, type TopicMapLayout } from "@/components/course-map/topic-map/topic-map-layout";
import { dayWords } from "@/components/unit-inbox/topic-page/topic-facts";

/**
 * What the hybrid's lesson map draws (spec: ../hybrid/hybrid.md): a
 * lesson's plan as a map in the topic map's geometry, with the marks the
 * lesson's own Plan list wears, and the words naming the lesson. The plan
 * and its two derived facts only; nothing says a step is done. Every
 * function here is pure.
 */

/** "Today's lesson", "Yesterday's lesson", "Lesson of Tue 3 Nov"; a
 *  practice session says "practice". */
export function lessonWords(day: string, today: string, kind: "lesson" | "practice" = "lesson"): string {
	const when = dayWords(day, today);
	if (when === "Today") return `Today's ${kind}`;
	if (when === "Yesterday") return `Yesterday's ${kind}`;
	return `${kind === "lesson" ? "Lesson" : "Practice"} of ${when}`;
}

/** A plan drawn in the topic map's geometry, and its edges in the map's terms. */
export interface StepsDrawing {
	layout: TopicMapLayout;
	needs: CourseMapEdge[];
}

/**
 * The plan in the topic map's geometry: each step a node, each edge a
 * need, the step it rests on above it. A tutor writes the plan, so it is
 * read defensively: a repeated step, an edge naming a missing step, a
 * repeated edge and an edge that would close a loop are left out. The one
 * place a plan's ids become the map's handles.
 */
export function stepsLayout(plan: SessionPlan): StepsDrawing {
	const ids = [...new Set(plan.tree.nodes.map((node) => node.id))];
	const known = new Set(ids);
	const above = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
	/** Whether `goal` is among `start` and everything it rests on. */
	const restsOn = (start: string, goal: string): boolean => {
		const stack = [start];
		const seen = new Set<string>();
		while (stack.length) {
			const next = stack.pop()!;
			if (next === goal) return true;
			if (seen.has(next)) continue;
			seen.add(next);
			stack.push(...(above.get(next) ?? []));
		}
		return false;
	};
	const needs: CourseMapEdge[] = [];
	for (const { from, to } of plan.tree.edges) {
		if (!known.has(from) || !known.has(to) || above.get(to)!.has(from) || restsOn(from, to)) continue;
		above.get(to)!.add(from);
		needs.push({ kind: "needs", prerequisite: from as TopicHandle, topic: to as TopicHandle });
	}
	// The layout reads a topic's handle and nothing else.
	const steps = ids.map((id) => ({ handle: id as TopicHandle }) as CourseMapTopic);
	return { layout: layoutTopicMap(steps, needs, STEP_SIZE), needs };
}

/** A step's card: narrower than a course topic's, so a lesson three steps
 *  wide fits the topic page's map column whole at 1512×982. */
export const STEP_SIZE: NodeSize = { width: 184, height: 64 };
/** A step's tag ("Next", "Left off here") sits this far above its card. */
export const TAG_ROOM = 20;

type Frame = { width: number; height: number };
type Fade = { x: number; y: number };

/** One axis of the opening view: the plan's span `lo`..`hi` centred in
 *  the frame's clear middle when it fits there, else `at` at the frame's
 *  middle, pulled back so the plan's edge never leaves the clear middle. */
function along(lo: number, hi: number, at: number, frame: number, fade: number, zoom: number): number {
	if ((hi - lo) * zoom <= frame - fade * 2) return frame / 2 - ((lo + hi) / 2) * zoom;
	return Math.min(fade - lo * zoom, Math.max(frame - fade - hi * zoom, frame / 2 - at * zoom));
}

/** The scale at which a plan and the tags over its top row fit a frame's
 *  clear middle (inside the fade), up to full size. */
function fitZoom(layout: TopicMapLayout, frame: Frame, fade: Fade): number {
	if (layout.width === 0 || layout.height === 0) return 1;
	return Math.min(1, (frame.width - fade.x * 2) / layout.width, (frame.height - fade.y * 2) / (layout.height + TAG_ROOM));
}

/**
 * Where a lesson's step map opens in a frame whose edges fade by `fade`:
 * the whole plan, tags included, clear of the fade at the largest scale up
 * to full size; never below the topic map's whole-course scale, where a
 * plan still too big is framed on the step `current` (the first step when
 * none), the plan's edges kept inside the clear middle. Pure.
 */
export function stepsCamera(layout: TopicMapLayout, current: TopicHandle | null, frame: Frame, fade: Fade): Camera {
	const zoom = Math.max(WHOLE_COURSE_ZOOM, fitZoom(layout, frame, fade));
	const at = (current && layout.topics.get(current)) ?? layout.topics.get(layout.layers[0]?.[0] as TopicHandle);
	const [cx, cy] = at ? [at.x + layout.node.width / 2, at.y + layout.node.height / 2] : [layout.width / 2, layout.height / 2];
	return {
		x: along(0, layout.width, cx, frame.width, fade.x, zoom),
		y: along(-TAG_ROOM, layout.height, cy, frame.height, fade.y, zoom),
		zoom,
	};
}

export interface StepMark {
	status: PlanNodeStatus;
	/** "Left off here" above the current step of a lesson that does not wait
	 *  on him; a lesson that waits says "Your turn" on its pick-up row. */
	tag: string | null;
}

/** Each step's mark: the step the lesson's newest tagged question was
 *  about, steps earlier questions were about, and the rest. */
export function stepMarks(plan: SessionPlan, waits: boolean): Map<string, StepMark> {
	const visited = new Set(plan.visited);
	return new Map(
		plan.tree.nodes.map((node): [string, StepMark] => {
			if (node.id === plan.current) return [node.id, { status: "current", tag: waits ? null : "Left off here" }];
			return [node.id, { status: visited.has(node.id) ? "visited" : "upcoming", tag: null }];
		}),
	);
}
