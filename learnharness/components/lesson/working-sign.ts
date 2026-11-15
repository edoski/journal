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

/** The one line under the transcript while he waits: "Compacting the
 *  conversation…" only while something of his waits on the compaction
 *  (a turn is running or held for it), else "Thinking…" while a turn runs
 *  (`showsWorking`); nothing while the lesson waits on him (round 8: the
 *  compaction line sat under a question waiting on him). Pure. */
export function waitingLine(messages: readonly LhViewMessage[], { busy, compacting }: { busy: boolean; compacting: boolean }): "compacting" | "thinking" | null {
	if (compacting && busy) return "compacting";
	return showsWorking(messages, busy) ? "thinking" : null;
}
