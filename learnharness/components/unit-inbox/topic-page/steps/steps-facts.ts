import type { CourseMapEdge, CourseMapTopic, PlanNodeStatus, SessionPlan, TopicHandle } from "@/src/core";
import { layoutTopicMap, NODE_GAP, WHOLE_COURSE_ZOOM, type Camera, type NodeSize, type TopicMapLayout } from "@/components/course-map/topic-map/topic-map-layout";
import { PLAN_MAP_CAP } from "@/src/core";
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
export function stepsLayout(plan: SessionPlan, size: NodeSize = STEP_SIZE): StepsDrawing {
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
	return { layout: layoutTopicMap(steps, needs, size), needs };
}

/** A step's card before the pane is measured, and the least it is: as
 *  wide as a lesson three steps wide leaves at 1512×982, and two lines of
 *  title tall. `stepCard` sizes it to the pane. */
export const STEP_SIZE: NodeSize = { width: 184, height: 64 };

/** How many steps side by side a card is sized for: the plan's widest
 *  row, at most four (`PLAN_MAP_CAP.across`). Pure. */
export function stepsAcross(layout: TopicMapLayout): number {
	return Math.max(1, Math.min(PLAN_MAP_CAP.across, Math.max(0, ...layout.layers.map((layer) => layer.length))));
}

/**
 * A step's card for a pane `frameWidth` wide (round 14, m34: fixed cards
 * cut "One-to-one against onto for square…" and "What random variables
 * and…"): the pane's clear middle, inside the fade, split into `across`
 * columns, so the plan's widest row fits at full size; no wider than its
 * longest title needs on one line (`oneLine`, the widest card measured
 * with its title unwrapped), nor narrower than `STEP_SIZE` while the
 * column allows it. Every card is as tall as the tallest one at that
 * width (`heightAt`, measured with each title wrapping whole), at least
 * `STEP_SIZE`'s height, so every title shows whole. Pure.
 */
export function stepCard(across: number, frameWidth: number, fade: { x: number }, oneLine: number, heightAt: (width: number) => number): NodeSize {
	const column = Math.floor((frameWidth - fade.x * 2 - (across - 1) * NODE_GAP) / across);
	const width = Math.max(1, Math.min(column, Math.max(STEP_SIZE.width, Math.ceil(oneLine))));
	return { width, height: Math.max(STEP_SIZE.height, Math.ceil(heightAt(width))) };
}
/** A step's tag ("Next", "Left off here") sits this far above its card. */
export const TAG_ROOM = 20;

type Frame = { width: number; height: number };
type Fade = { x: number; y: number };

/** One axis of the opening view: the plan's span `lo`..`hi` in the
 *  frame's clear middle when it fits there, centred, or on its start edge
 *  with `top` (the vertical axis: a plan sits at the top of the pane, by
 *  the list's first row, never floating mid-pane; round 14, m39, Kernel's
 *  two sheet parts); else `at` at the frame's middle, pulled back so the
 *  plan's edge never leaves the clear middle. */
function along(lo: number, hi: number, at: number, frame: number, fade: number, zoom: number, top = false): number {
	if ((hi - lo) * zoom <= frame - fade * 2) return top ? fade - lo * zoom : frame / 2 - ((lo + hi) / 2) * zoom;
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
 * to full size, centred across and at the top of the frame; never below
 * the topic map's whole-course scale, where a plan still too big is framed
 * on the step `current` (the first step when none), the plan's edges kept
 * inside the clear middle. Pure.
 */
export function stepsCamera(layout: TopicMapLayout, current: TopicHandle | null, frame: Frame, fade: Fade): Camera {
	const zoom = Math.max(WHOLE_COURSE_ZOOM, fitZoom(layout, frame, fade));
	const at = (current && layout.topics.get(current)) ?? layout.topics.get(layout.layers[0]?.[0] as TopicHandle);
	const [cx, cy] = at ? [at.x + layout.node.width / 2, at.y + layout.node.height / 2] : [layout.width / 2, layout.height / 2];
	return {
		x: along(0, layout.width, cx, frame.width, fade.x, zoom),
		y: along(-TAG_ROOM, layout.height, cy, frame.height, fade.y, zoom, true),
		zoom,
	};
}

export interface StepMark {
	status: PlanNodeStatus;
	/** "Left off here" above the current step of a lesson that does not wait
	 *  on him; a lesson that waits says "Your turn" on its pick-up row. */
	tag: string | null;
}

/** The step the map rings: while the lesson waits on him, the step his
 *  open question asks about (`asked`), a check back on a step done
 *  included, so "Your turn" names the question in front of him (round 14,
 *  m40: "Your turn on Undoing and the image" while the open question was
 *  about collisions); else where the lesson stands (`current`). Pure. */
export function ringedStep(plan: SessionPlan, waits: boolean): string | null {
	const asked = plan.asked && plan.tree.nodes.some((node) => node.id === plan.asked) ? plan.asked : null;
	return waits && asked ? asked : plan.current;
}

/** Each step's mark: the ringed step (`ringedStep`), steps earlier
 *  questions were about, and the rest. "Left off here" only while the
 *  plan has a step still ahead: on a lesson that went through every step
 *  it would say he stopped partway. */
export function stepMarks(plan: SessionPlan, waits: boolean): Map<string, StepMark> {
	const ring = ringedStep(plan, waits);
	const visited = new Set(plan.current && plan.current !== ring ? [...plan.visited, plan.current] : plan.visited);
	const ahead = plan.tree.nodes.some((node) => node.id !== ring && !visited.has(node.id));
	return new Map(
		plan.tree.nodes.map((node): [string, StepMark] => {
			if (node.id === ring) return [node.id, { status: "current", tag: waits || !ahead ? null : "Left off here" }];
			return [node.id, { status: visited.has(node.id) ? "visited" : "upcoming", tag: null }];
		}),
	);
}
