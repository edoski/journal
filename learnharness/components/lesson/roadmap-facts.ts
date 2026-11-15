/**
 * What the lesson's roadmap draws (spec: lesson-roadmap.md): the plan's
 * steps in teaching order with where he is, which ones the tutor marked
 * done, and where in the transcript each step was first taught. Pure.
 */

import { normalizeQuestionType, POSITION_QUESTION_TOOLS, type DerivedPlanStatuses, type PlanNodeStatus, type PlanTree } from "@/src/core";
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
	/** Its title waits: his prediction on it is open, and a title can read
	 *  as its answer (round 9: "Pivots in every column" above the question
	 *  asking what the echelon form must look like). */
	held?: boolean;
}

/** The step whose prediction waits on him: the open question is a
 *  `predict` tagged with that step. Null for a check or no question. */
export function predictionOpenOn(pending: { tool: string; input: unknown } | null): string | null {
	if (!pending || !POSITION_QUESTION_TOOLS.includes(pending.tool)) return null;
	const input = pending.input as { type?: unknown; nodeId?: unknown } | null;
	if (normalizeQuestionType(input?.type) !== "predict") return null;
	return typeof input?.nodeId === "string" ? input.nodeId : null;
}

/** The steps in teaching order (each after everything it rests on).
 *  `predicting` is the step whose prediction is open (`predictionOpenOn`):
 *  while it is the one he is on, its title is held. */
export function roadmapSteps(tree: Pick<PlanTree, "nodes" | "edges">, statuses: DerivedPlanStatuses, taught: ReadonlySet<string>, predicting: string | null = null): RoadmapStep[] {
	const steps = topoFor(tree.nodes, tree.edges).order.map((n): RoadmapStep => ({
		id: n.id,
		title: n.title,
		status: statuses.current === n.id ? "current" : statuses.visited.has(n.id) ? "visited" : "upcoming",
		done: statuses.done.has(n.id),
		next: false,
		taught: taught.has(n.id),
		...(statuses.current === n.id && predicting === n.id ? { held: true } : {}),
	}));
	const current = steps.findIndex((s) => s.status === "current");
	steps.forEach((s, i) => {
		if (i < current && s.status === "upcoming") s.status = "passed";
	});
	const next = steps.findIndex((s, i) => i > current && s.status === "upcoming");
	if (next >= 0) steps[next]!.next = true;
	return steps;
}

/** The words beside the strip: the step he is on, none while its title
 *  is held, else the next one, else that every step was taught. Null with
 *  no steps. */
export function roadmapLabel(steps: readonly RoadmapStep[]): string | null {
	if (steps.length === 0) return null;
	const current = steps.find((s) => s.status === "current");
	if (current) return current.held ? "" : current.title;
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
