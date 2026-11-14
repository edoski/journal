import type { CourseMapEdge, CourseMapTopic, PlanNodeStatus, SessionPlan, TopicHandle } from "@/src/core";
import { layoutTopicMap, type TopicMapLayout } from "@/components/course-map/topic-map/topic-map-layout";
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
	return { layout: layoutTopicMap(steps, needs), needs };
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
