import type { PlanTree } from "./contracts/plan.ts";
import { derivePlanStatusesLh, LESSON_PROGRESS_TOOL } from "./contracts/plan.ts";
import type { SessionEnd, SessionMode } from "./contracts/chat.ts";
import { endsInDismissal, nativeInputCause, needsContinuation, NEUTRAL_MARKERS, sessionModeOf, type LhMessage } from "./native-messages.ts";
import { phaseAt3Lh } from "./phases.ts";

/**
 * How the tutor's last turn left the session, folded from the record (the
 * question or problem it posed is read separately). The tutor owes the
 * next word when its turn failed, was stopped, never answered his message
 * or a wake, or ran tools it never answered: "cut". It asked him to go on
 * partway through a lesson when its turn ended in its own words while the
 * plan waits for his go-ahead or the step it stopped on leads to another,
 * or when he dismissed its question, or a lesson it picked up has
 * reached no step yet: "mid-lesson". Anything else ended
 * the lesson, a practice round or a one-off answer: "closed". Pure.
 */
export function sessionEndOf(messages: readonly LhMessage[], tree: PlanTree | undefined, initial: SessionMode = "teach"): SessionEnd {
	const last = [...messages].reverse().find((m) => !(m.role === "custom" && NEUTRAL_MARKERS.includes(m.customType)));
	if (!last) return "closed";
	if (last.role === "toolResult") {
		if (needsContinuation(messages)) return "cut";
		return endsInDismissal(messages) ? "mid-lesson" : "closed";
	}
	if (last.role !== "assistant" || last.stopReason !== "stop") return "cut";
	if (closedTonight(messages)) return "closed";
	if (sessionModeOf(messages, initial) === "practice") return "closed";
	const phase = phaseAt3Lh(messages);
	if (phase === "plan") return "mid-lesson";
	if (phase !== "teach" || !tree) return "closed";
	const { current } = derivePlanStatusesLh(tree, messages);
	if (current === null) return "mid-lesson";
	return tree.edges.some((edge) => edge.from === current) ? "mid-lesson" : "closed";
}

/** True when the tutor's latest close (`lesson_progress` with `close: true`)
 *  has had no word from him since: he finished for tonight. His next
 *  message reopens the session. Pure. */
export function closedTonight(messages: readonly LhMessage[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "assistant") {
			if (m.stopReason === "error" || m.stopReason === "aborted") continue;
			if (m.content.some((b) => b.type === "toolCall" && b.name === LESSON_PROGRESS_TOOL && (b.arguments as { close?: unknown } | undefined)?.close === true)) return true;
		} else if (nativeInputCause(m as never, messages.slice(0, i) as never) === "learner") {
			return false;
		}
	}
	return false;
}
