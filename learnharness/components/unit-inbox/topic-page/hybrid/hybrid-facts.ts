import type { SessionPlan } from "@/src/core";
import { stepMarks, type StepMark } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import { roadmapSteps } from "@/components/lesson/roadmap-facts";
import type { SessionEntry, TopicAction } from "@/components/unit-inbox/topic-page/topic-facts";

/**
 * What the hybrid page draws beyond the shared facts (spec:
 * hybrid.md), pure: which lesson the map shows at first, and each step's
 * mark, the step after the one the lesson stopped on marked Next, as the
 * lesson's panel names it.
 */

/** A session whose tutor wrote a plan with steps. */
export type PlannedEntry = SessionEntry & { plan: SessionPlan };

/** Whether a session's plan draws as a map: two steps or more. One step
 *  is a lone card that says what Now says (round 15, 2 n6: Kernel's page
 *  drew "Part (c) of sheet 4" alone at the top of an empty pane), so the
 *  history takes the width instead. */
export const isPlanned = (entry: SessionEntry): entry is PlannedEntry => new Set(entry.plan?.tree.nodes.map((node) => node.id) ?? []).size > 1;

/** The lesson the map shows at first: the session the page's action opens
 *  when it planned, else the topic's newest own session that planned;
 *  null when none planned. A session that only touched the topic shows
 *  its map only when he picks it (round 7: Kernel's page drew the Eigen
 *  lesson's map). */
export function mapLessonAtFirst(sessions: readonly SessionEntry[], action: TopicAction): string | null {
	const planned = sessions.filter((entry) => entry.own && isPlanned(entry));
	const opens = "chat" in action ? planned.find((entry) => entry.chat.id === action.chat.id) : undefined;
	return (opens ?? planned[0])?.chat.id ?? null;
}

/** The step after the one the lesson stopped on, as the lesson's ⌘K
 *  panel names it (`roadmapSteps`): the first in teaching order, each
 *  step after everything it rests on, that no question has been about
 *  yet. Round 11, 3 n6: the map marked the stopped step's successor in
 *  the graph Next while it still rested on four untaught steps, and the
 *  panel named another. Empty before any step and once every step was
 *  asked about. */
export function nextSteps(plan: SessionPlan): Set<string> {
	if (!plan.current) return new Set();
	const visited = new Set(plan.visited);
	const steps = roadmapSteps(plan.tree, { current: plan.current, visited, done: new Set() }, new Set());
	const next = steps.find((step) => step.next);
	return new Set(next ? [next.id] : []);
}

/** Each step's mark: the steps tab's marks (the step it stopped on, the
 *  steps earlier questions were about), with "Next" over the step after
 *  the one it stopped on (`nextSteps`). */
export function hybridMarks(plan: SessionPlan, waits: boolean): Map<string, StepMark> {
	const marks = stepMarks(plan, waits);
	for (const id of nextSteps(plan)) {
		const mark = marks.get(id);
		if (mark) marks.set(id, { ...mark, tag: "Next" });
	}
	return marks;
}
