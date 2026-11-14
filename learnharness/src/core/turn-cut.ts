import { nativeInputCause, NEUTRAL_MARKERS, type LhMessage } from "./native-messages.ts";

/**
 * The tutor's turn ended without a word after his input (round 2, 14 Nov
 * 2026): the app restarted while it ran, or he stopped it before its first
 * word. The record ends at his input (a message, a dock card, a stop for
 * the night), or at a stopped reply with nothing in it, with only neutral
 * markers after. An answer to a question is not this case: the
 * continuation law (`needsContinuation`) resumes that turn by itself. Pure.
 */
export function replyNeverCame(messages: readonly LhMessage[]): boolean {
	let i = messages.length - 1;
	while (i >= 0 && messages[i]!.role === "custom" && NEUTRAL_MARKERS.includes((messages[i] as { customType: string }).customType)) i--;
	const last = messages[i];
	if (!last) return false;
	if (last.role === "assistant") {
		return last.stopReason === "aborted" && !last.content.some((b) => (b.type === "text" && b.text.trim() !== "") || b.type === "toolCall");
	}
	if (last.role === "toolResult") return false;
	return nativeInputCause(last as never, messages.slice(0, i) as never) === "learner";
}
