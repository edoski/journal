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
	return replyCutOf(messages) !== null;
}

const isNeutral = (m: LhMessage): boolean => m.role === "custom" && NEUTRAL_MARKERS.includes((m as { customType: string }).customType);

/** A reply someone stopped before its first word: thinking at most. */
function isEmptyStop(m: LhMessage): boolean {
	return m.role === "assistant" && m.stopReason === "aborted" &&
		!m.content.some((b) => (b.type === "text" && b.text.trim() !== "") || b.type === "toolCall");
}

/** Why the reply never came (`replyNeverCame`): "stopped" when the record
 *  ends at an empty reply someone stopped (only a stop press, his, from
 *  any window, aborts a turn), "lost" when it ends at his input with no
 *  reply at all (the app restarted while it ran); null when a reply came.
 *  Pure. */
export function replyCutOf(messages: readonly LhMessage[]): "stopped" | "lost" | null {
	let i = messages.length - 1;
	while (i >= 0 && isNeutral(messages[i]!)) i--;
	const last = messages[i];
	if (!last) return null;
	if (last.role === "assistant") return isEmptyStop(last) ? "stopped" : null;
	if (last.role === "toolResult") return null;
	return nativeInputCause(last as never, messages.slice(0, i) as never) === "learner" ? "lost" : null;
}

/** The empty stopped replies a `continue` steps past (round 4): the record
 *  keeps them, since they show his stop, but the tutor resumes from the
 *  input before them, which pi needs as the history's last message. Pure. */
export function stoppedReplyIds(messages: readonly LhMessage[]): Set<string> {
	const ids = new Set<string>();
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (isEmptyStop(m)) ids.add(m.id);
		else if (!isNeutral(m)) break;
	}
	return ids;
}
