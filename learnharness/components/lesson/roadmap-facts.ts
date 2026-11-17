/**
 * What the lesson's roadmap draws (spec: lesson-roadmap.md): the plan's
 * steps in teaching order with where he is, which ones the tutor marked
 * done, and where in the transcript each step was first taught. Pure.
 */

import { derivePlanStatuses, POSITION_QUESTION_TOOLS, type DerivedPlanStatuses, type PlanNodeStatus, type PlanTree } from "@/src/core";
import { topoFor, type PopupMessage } from "@/components/lesson/plan-facts";

export interface RoadmapStep {
	id: string;
	title: string;
	/** `passed`: a step before the one he is on that he never reached,
	 *  behind him all the same (round 6: drawn hollow like the next one). */
	status: PlanNodeStatus | "passed";
	/** The tutor's lesson_progress named it done. */
	done: boolean;
	/** The first step after the current one (or the first, before any). */
	next: boolean;
	/** It has a place in the transcript to open. */
	taught: boolean;
}

/** The steps in teaching order (each after everything it rests on). A
 *  step always shows its title, which names the idea learned: `plan_init`
 *  refuses a title that states its result (round 9, M1), so none is held
 *  while his prediction is open (round 15, m15: the row then read "Your
 *  prediction first", a move, not the idea). */
export function roadmapSteps(tree: Pick<PlanTree, "nodes" | "edges">, statuses: DerivedPlanStatuses, taught: ReadonlySet<string>): RoadmapStep[] {
	const steps = topoFor(tree.nodes, tree.edges).order.map((n): RoadmapStep => ({
		id: n.id,
		title: n.title,
		status: statuses.current === n.id ? "current" : statuses.visited.has(n.id) ? "visited" : "upcoming",
		done: statuses.done.has(n.id),
		next: false,
		taught: taught.has(n.id),
	}));
	const current = steps.findIndex((s) => s.status === "current");
	steps.forEach((s, i) => {
		if (i < current && s.status === "upcoming") s.status = "passed";
	});
	const next = steps.findIndex((s, i) => i > current && s.status === "upcoming");
	if (next >= 0) steps[next]!.next = true;
	return steps;
}

/** The lesson's steps from its transcript, as the strip and panel draw
 *  them: where he is is the newest tagged question's step, a prediction
 *  on it open or not. `taught` are the steps with a place to open. */
export function lessonRoadmapSteps(tree: PlanTree, messages: Parameters<typeof derivePlanStatuses>[1], taught: ReadonlySet<string>): RoadmapStep[] {
	return roadmapSteps(tree, derivePlanStatuses(tree, messages), taught);
}

/** The words beside the strip: the step he is on, else the next one,
 *  else that every step was taught. Null with no steps. */
export function roadmapLabel(steps: readonly RoadmapStep[]): string | null {
	if (steps.length === 0) return null;
	const current = steps.find((s) => s.status === "current");
	if (current) return current.title;
	const next = steps.find((s) => s.next);
	return next ? `Next: ${next.title}` : "Every step taught";
}

/** A transcript part's key: its message's index, then its own. */
export const partKey = (message: number, part: number) => `${message}:${part}`;

/**
 * Where each step was first taught: the first question tagged with it
 * (`nodeId` on a position question), and in that question's provider
 * step the first text the tutor wrote, since the teaching comes before
 * its question; the question itself when that step has no text of its
 * own, or when an earlier step already starts at the same text. Keyed by
 * `partKey`, valued by the step's id. Ids missing from `ids` move nothing.
 */
export function stepAnchors(messages: readonly PopupMessage[], ids: ReadonlySet<string>): Map<string, string> {
	const anchors = new Map<string, string>();
	const seen = new Set<string>();
	messages.forEach((message, mi) => {
		message.parts.forEach((part, pi) => {
			if (!part.type.startsWith("tool-") || !POSITION_QUESTION_TOOLS.includes(part.type.slice("tool-".length))) return;
			const nodeId = (part.input as { nodeId?: unknown } | undefined)?.nodeId;
			if (typeof nodeId !== "string" || !ids.has(nodeId) || seen.has(nodeId)) return;
			seen.add(nodeId);
			let start = pi - 1;
			while (start >= 0 && message.parts[start]!.type !== "step-start") start--;
			let text = -1;
			for (let i = start + 1; i < pi; i++) {
				if (message.parts[i]!.type === "text") {
					text = i;
					break;
				}
			}
			const key = text >= 0 && !anchors.has(partKey(mi, text)) ? partKey(mi, text) : partKey(mi, pi);
			anchors.set(key, nodeId);
		});
	});
	return anchors;
}
