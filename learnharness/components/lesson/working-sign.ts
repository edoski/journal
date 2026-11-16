import { PRACTICE_PROBLEM_TOOL, QUESTION_TOOLS, type LhViewMessage } from "@/src/core";

/**
 * Whether the lesson shows its "Thinking…" line (round 2, 14 Nov 2026):
 * the whole time a turn runs, except while the tutor's words or a tool card
 * it is writing are themselves arriving at the end of the lesson. The
 * tutor's own reasoning never shows (agent chrome out), so a turn that is
 * still reasoning, or running a tool with no card, would otherwise leave
 * the pane looking idle for most of a minute. A question or problem posed
 * at the end ends the tutor's turn: what is left is the turn closing, and
 * he can already answer (round 12, 3 D6: the line showed for 1–4 s under
 * every posed question). Pure.
 */
export function showsWorking(messages: readonly LhViewMessage[], busy: boolean): boolean {
	if (!busy) return false;
	const last = messages.at(-1);
	if (last?.role !== "assistant") return true;
	const part = last.parts.findLast((p) => p.type !== "reasoning" && p.type !== "step-start");
	if (!part) return true;
	if (part.type === "text") return !part.text?.trim();
	if (posed(part)) return false;
	return !(part.type.startsWith("tool-") && part.state === "input-streaming");
}

/** A question he can answer (its call cleared the boundary) or a posed
 *  problem. */
function posed(part: LhViewMessage["parts"][number]): boolean {
	const tool = part.type.startsWith("tool-") ? part.type.slice("tool-".length) : "";
	if ((QUESTION_TOOLS as readonly string[]).includes(tool)) return part.state === "input-available";
	return tool === PRACTICE_PROBLEM_TOOL && part.state === "output-available";
}
