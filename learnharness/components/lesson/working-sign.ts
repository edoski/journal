import type { LhViewMessage } from "@/src/core";

/**
 * Whether the lesson shows its "Thinking…" line (round 2, 14 Nov 2026):
 * the whole time a turn runs, except while the tutor's words or a tool card
 * it is writing are themselves arriving at the end of the lesson. The
 * tutor's own reasoning never shows (agent chrome out), so a turn that is
 * still reasoning, or running a tool with no card, would otherwise leave
 * the pane looking idle for most of a minute. Pure.
 */
export function showsWorking(messages: readonly LhViewMessage[], busy: boolean): boolean {
	if (!busy) return false;
	const last = messages.at(-1);
	if (last?.role !== "assistant") return true;
	const part = last.parts.findLast((p) => p.type !== "reasoning" && p.type !== "step-start");
	if (!part) return true;
	if (part.type === "text") return !part.text?.trim();
	return !(part.type.startsWith("tool-") && part.state === "input-streaming");
}
