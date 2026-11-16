/**
 * The lesson plan's early draft (round 14, M9; Edo, 16 Nov 2026: "approved
 * do this and keep high reasoning"). From the probe's last answer to the
 * first teaching question took 60 to 80 s, most of it the plan turn's own
 * thinking. So when the prober poses the question it expects to conclude on
 * (`recall` with `last`), the teacher drafts the plan in the background, from
 * what the probe has measured, while he answers. When the teacher's turn
 * opens, it amends the draft to his last answer instead of planning from
 * nothing. The plan turn keeps its high effort; the draft runs at it too.
 *
 * This file is the pure half: when a draft is wanted, what the draft is
 * asked, and what the teacher reads of it. The running half (the forked
 * query, Stop and Done cancelling it) is server/plan-draft.ts.
 */
import { isLastProbeQuestion } from "./question-core.ts";
import { danglingQuestionOf, type LhMessage } from "./native-messages.ts";

/** A draft's map: what plan_init would have saved. */
export interface PlanDraft {
	mermaid: string;
	goal?: { title: string; topic?: string };
}

/** The probe's open last question (its call id), when the record ends on
 *  one: the draft is made from everything before it. */
export function lastProbeQuestionOpen(messages: readonly LhMessage[]): string | null {
	const open = danglingQuestionOf(messages);
	return open && isLastProbeQuestion({ name: open.tool, arguments: open.input }) ? open.toolCallId : null;
}

/** Whether a draft made at question `basis` still fits the lesson: the
 *  question is still open, or he answered it and the probe concluded on it
 *  (a clean probe_done after his answer) with no plan yet. A probe that asked
 *  on, a dismissed question, or a plan already made leaves it stale. */
export function draftBasisHolds(messages: readonly LhMessage[], basis: string): boolean {
	if (lastProbeQuestionOpen(messages) === basis) return true;
	const answered = messages.findIndex((m) => m.role === "toolResult" && m.toolCallId === basis);
	if (answered < 0) return false;
	let concluded = false;
	for (const m of messages.slice(answered + 1)) {
		if (m.role === "assistant") {
			for (const block of m.content) {
				if (block.type !== "toolCall") continue;
				if (block.name === "plan_init") return false;
				if (block.name !== "probe_done" && block.name !== "course_save" && block.name !== "send_to_user") return false;
			}
		}
		if (m.role === "toolResult" && m.toolName === "probe_done" && !m.isError && (m.details as { ok?: unknown } | null)?.ok === true) concluded = true;
	}
	return concluded;
}

/** What the draft is asked, as the input of the forked plan turn. He never
 *  sees it, and nothing the draft calls is kept but its map. */
export const PLAN_DRAFT_TEXT =
	"[PLAN DRAFT] This is not his message, and he never sees what you write here. The probe's last question is open, and this drafts the lesson's plan while he answers it. " +
	"Plan the full teaching arc from my current understanding to the goal understanding, from what the probe has measured so far, as the teacher would once the probe concludes. " +
	"Apply the teaching methodology in your system prompt, and find the optimal way to teach me this. " +
	"Find the unconditional truths, plan the motivated derivations/discoveries, so every reasoning step has to land as obviously true. " +
	"Take your time here and really think this through. " +
	"Where the open question's answer would change the map, plan for the reading the evidence so far makes likeliest: the teacher amends the draft to my answer. " +
	"Then call plan_init once, with the map and the lesson's goal, and nothing else: no message to me, no question, no save.";

/** What the teacher reads of a draft, after the handoff's own words. */
export function planDraftNote(draft: PlanDraft): string {
	const goal = draft.goal ? `Its goal: ${draft.goal.title}${draft.goal.topic ? ` (topic ${draft.goal.topic})` : ""}.\n` : "";
	return (
		"A draft of this plan, written from the probe while my last answer was still open. " +
		"It is a draft, not my plan: start from it, amend it to my last answer and the assessment above, keep what still holds and change what my answer moves, " +
		"then call plan_init with the map as amended and teach its first step, as above.\n" +
		goal +
		"```mermaid\n" + draft.mermaid.trim() + "\n```"
	);
}
