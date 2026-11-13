import type { SessionPlan } from "@/src/core";
import { stepMarks, type StepMark } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import type { SessionEntry, TopicAction } from "@/components/unit-inbox/topic-page/topic-facts";

/**
 * What the hybrid page draws beyond the shared facts (spec:
 * hybrid.md), pure: which lesson the map shows at first, and each step's
 * mark, the steps after the one the lesson stopped on marked Next.
 */

/** A session whose tutor wrote a plan with steps. */
export type PlannedEntry = SessionEntry & { plan: SessionPlan };

export const isPlanned = (entry: SessionEntry): entry is PlannedEntry => (entry.plan?.tree.nodes.length ?? 0) > 0;

/** The lesson the map shows at first: the session the page's action opens
 *  when it planned, else the newest session that planned; null when no
 *  session planned. */
export function mapLessonAtFirst(sessions: readonly SessionEntry[], action: TopicAction): string | null {
	const planned = sessions.filter(isPlanned);
	const opens = "chat" in action ? planned.find((entry) => entry.chat.id === action.chat.id) : undefined;
	return (opens ?? planned[0])?.chat.id ?? null;
}

/** The steps right after the one the lesson stopped on: those that rest
 *  on it in the plan and no question has been about yet. */
export function nextSteps(plan: SessionPlan): Set<string> {
	if (!plan.current) return new Set();
	const known = new Set(plan.tree.nodes.map((node) => node.id));
	const visited = new Set(plan.visited);
	return new Set(plan.tree.edges.filter(({ from, to }) => from === plan.current && known.has(to) && !visited.has(to) && to !== plan.current).map(({ to }) => to));
}

/** Each step's mark: the steps tab's marks (the step it stopped on, the
 *  steps earlier questions were about), with "Next" over the steps right
 *  after the one it stopped on. */
export function hybridMarks(plan: SessionPlan, waits: boolean): Map<string, StepMark> {
	const marks = stepMarks(plan, waits);
	for (const id of nextSteps(plan)) {
		const mark = marks.get(id);
		if (mark) marks.set(id, { ...mark, tag: "Next" });
	}
	return marks;
}
