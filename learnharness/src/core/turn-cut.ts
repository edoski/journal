import { nativeInputCause, needsContinuation, NEUTRAL_MARKERS, PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, SEND_TO_USER_TOOL, type LhMessage } from "./native-messages.ts";
import { QUESTION_TOOLS } from "./pending.ts";

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

/** A reply someone stopped before its first word: thinking at most, or a
 *  tool call cut off before any of its arguments came, which shows him
 *  nothing and never ran. */
function isEmptyStop(m: LhMessage): boolean {
	return m.role === "assistant" && m.stopReason === "aborted" &&
		!m.content.some((b) => (b.type === "text" && b.text.trim() !== "") || (b.type === "toolCall" && hasArguments(b.arguments)));
}

/** What of a reply he reads: text the voice guard kept, a message sent
 *  to him, a question, a problem, a problem's close (its marks and model
 *  solution), and a save of his work (the mark under his answer; round 9:
 *  "before it replied" stood under marks and a Model solution). Lesson
 *  progress or a lookup shows him nothing. */
const SHOWN_TOOLS: readonly string[] = [SEND_TO_USER_TOOL, ...QUESTION_TOOLS, PRACTICE_PROBLEM_TOOL, PRACTICE_CONCLUDE_TOOL, "course_save"];

/** Whether the tutor wrote to him after his latest input: a reply in the
 *  turn that was then stopped. A reply that failed or was stopped ended an
 *  earlier attempt, which a retry or Try again ran again: what it said is
 *  not this reply's (round 12, 4 minor 5: "mid-reply" under a Try again
 *  stopped before its first word, after a failed turn's mark). */
function saidSinceInput(messages: readonly LhMessage[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "assistant") {
			if (isEmptyStop(m)) continue;
			if (m.stopReason === "error" || m.stopReason === "aborted") return false;
			if (m.content.some((b) => (b.type === "text" && b.text.trim() !== "") || (b.type === "toolCall" && SHOWN_TOOLS.includes(b.name) && hasArguments(b.arguments)))) return true;
			continue;
		}
		if (!isNeutral(m) && nativeInputCause(m as never, messages.slice(0, i) as never) === "learner") return false;
	}
	return false;
}

function hasArguments(args: unknown): boolean {
	if (typeof args === "string") return args.trim() !== "" && args.trim() !== "{}";
	return args != null && typeof args === "object" && Object.keys(args).length > 0;
}

/** Why the reply never came (`replyNeverCame`): "stopped" when the record
 *  ends at an empty reply someone stopped (only a stop press, his, from
 *  any window, aborts a turn) with nothing said to him since his input,
 *  "stopped-mid" when the tutor had already written to him in that turn
 *  (round 7: "before it replied" stood under a full paragraph), "lost"
 *  when it ends at his input with no reply at all (the app restarted while
 *  it ran); null when a reply came. Pure. */
export function replyCutOf(messages: readonly LhMessage[]): "stopped" | "stopped-mid" | "lost" | null {
	let i = messages.length - 1;
	while (i >= 0 && isNeutral(messages[i]!)) i--;
	const last = messages[i];
	if (!last) return null;
	if (last.role === "assistant") return isEmptyStop(last) ? (saidSinceInput(messages.slice(0, i)) ? "stopped-mid" : "stopped") : null;
	if (last.role === "toolResult") return null;
	return nativeInputCause(last as never, messages.slice(0, i) as never) === "learner" ? "lost" : null;
}

/** Whether a `continue` has anything to do (round 4, 14 Nov 2026): the
 *  record owes the tutor's reaction to an answer, or its reply never came.
 *  Anything else means the reply already came, from another window's
 *  continue for one, so a second run would answer his input twice. Pure. */
export function continuationOwed(messages: readonly LhMessage[]): boolean {
	return needsContinuation(messages) || replyCutOf(messages) !== null;
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

/** Whether the tutor's last turn ended because he stopped it (round 8: a
 *  reply he stopped read "Reply cut off", the words for a restart): the
 *  record ends at a reply someone stopped, with only neutral markers
 *  after. Only a stop press, his, aborts a turn. Pure. */
export function stoppedByHim(messages: readonly LhMessage[]): boolean {
	let i = messages.length - 1;
	while (i >= 0 && isNeutral(messages[i]!)) i--;
	const last = messages[i];
	return last?.role === "assistant" && last.stopReason === "aborted";
}
