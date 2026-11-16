import { PRACTICE_PROBLEM_TOOL, QUESTION_TOOLS, SEND_TO_USER_TOOL, type LhViewMessage } from "@/src/core";

/**
 * Whether the lesson shows its "Thinking…" line (round 2, 14 Nov 2026):
 * the whole time a turn runs, except while the tutor's words or a tool card
 * it is writing are themselves arriving at the end of the lesson, its reply
 * still streaming them. The
 * tutor's own reasoning never shows (agent chrome out), so a turn that is
 * still reasoning, or running a tool with no card, would otherwise leave
 * the pane looking idle for most of a minute. A question or problem posed
 * at the end ends the tutor's turn: what is left is the turn closing, and
 * he can already answer (round 12, 3 D6: the line showed for 1–4 s under
 * every posed question). While Claude Code compacts, nothing is being
 * written, whatever the lesson ends on (round 14, 4 minor 10: 4.5 s with
 * no sign between two compaction passes). Pure.
 */
export function showsWorking(messages: readonly LhViewMessage[], busy: boolean, compacting = false): boolean {
	if (!busy) return false;
	if (compacting) return true;
	const last = messages.at(-1);
	if (last?.role !== "assistant") return true;
	const part = last.parts.findLast((p) => p.type !== "reasoning" && p.type !== "step-start");
	if (!part) return true;
	// Words he already has whole, with the turn still running, are no sign
	// of the rest (round 13, 4 #2: 6 to 16 s with nothing after a practice
	// problem's closing words).
	if (part.type === "text") return !part.text?.trim() || part.state === "done";
	if (posed(part)) return rewriteOwed(last.parts);
	return !(part.type.startsWith("tool-") && part.state === "input-streaming");
}

/** A question he can answer (its call cleared the boundary) or a posed
 *  problem. */
function posed(part: LhViewMessage["parts"][number]): boolean {
	const tool = part.type.startsWith("tool-") ? part.type.slice("tool-".length) : "";
	if ((QUESTION_TOOLS as readonly string[]).includes(tool)) return part.state === "input-available";
	return tool === PRACTICE_PROBLEM_TOOL && part.state === "output-available";
}

/** The reply's last message to him was refused and its rewrite has not
 *  come: a question beside it is kept for the rewrite, which poses it
 *  (voice-guard `KEPT`), so the turn is still writing. */
function rewriteOwed(parts: LhViewMessage["parts"]): boolean {
	for (let i = parts.length - 1; i >= 0; i--) {
		const part = parts[i]!;
		if (part.type === "text" && part.text?.trim()) return false;
		if (part.type === `tool-${SEND_TO_USER_TOOL}`) return part.state === "output-error";
	}
	return false;
}
