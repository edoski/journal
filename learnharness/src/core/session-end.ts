import type { PlanTree } from "./contracts/plan.ts";
import { derivePlanStatusesLh, LESSON_PROGRESS_TOOL, lessonProgressOf } from "./contracts/plan.ts";
import type { SessionEnd, SessionMode } from "./contracts/chat.ts";
import { endsInDismissal, nativeInputCause, needsContinuation, NEUTRAL_MARKERS, PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, problemInputForConclude, sessionModeOf, type LhMessage } from "./native-messages.ts";
import { phaseAt3Lh } from "./phases.ts";
import { topicResults, type PracticeConclusion } from "./practice-attempts.ts";

/**
 * How the tutor's last turn left the session, folded from the record (the
 * question or problem it posed is read separately). The tutor owes the
 * next word when its turn failed, was stopped, never answered his message
 * or a wake, or ran tools it never answered: "cut". It waits on him
 * partway through a lesson when it wrote the plan but taught no step, when he
 * dismissed its question, when a lesson it picked up has reached no step
 * yet, or when its turn ended in words that ask him something while the
 * step it stopped on leads to another: "mid-lesson". Practice waits on
 * him at Next problem while its work is unfinished: a lesson moved to
 * practice with plan steps left, or a session opened on topics (`topics`,
 * a review or a topic's practice) one of which he has not yet solved
 * without a hint in it, unless the tutor wrapped the round. His Done for
 * today on work still open (a question or problem it set aside, or a
 * session that waited on him) leaves it for next time: "left". Words that
 * end without a question ("Good place to stop") end the session there,
 * like anything else, as does the tutor's own close, and a practice round
 * with its work done: "closed". Pure.
 */
export function sessionEndOf(messages: readonly LhMessage[], tree: PlanTree | undefined, initial: SessionMode = "teach", topics: readonly string[] = []): SessionEnd {
	const last = [...messages].reverse().find((m) => !(m.role === "custom" && NEUTRAL_MARKERS.includes(m.customType)));
	if (!last) return "closed";
	if (last.role === "toolResult") {
		if (needsContinuation(messages)) return "cut";
		return endsInDismissal(messages) ? "mid-lesson" : "closed";
	}
	if (last.role !== "assistant" || last.stopReason !== "stop") return "cut";
	const done = doneTonightAt(messages);
	if (done !== null) return leftOpen(messages, done, tree, initial, topics) ? "left" : "closed";
	if (closedTonight(messages)) return "closed";
	if (sessionModeOf(messages, initial) === "practice") {
		if (tree && stepsLeft(tree, messages)) return "mid-lesson";
		return practiceUnfinished(messages, topics) ? "mid-lesson" : "closed";
	}
	const phase = phaseAt3Lh(messages);
	if (phase === "plan") return "mid-lesson";
	if (phase !== "teach" || !tree) return "closed";
	const { current } = derivePlanStatusesLh(tree, messages);
	if (current === null) return "mid-lesson";
	return asks(last) && tree.edges.some((edge) => edge.from === current) ? "mid-lesson" : "closed";
}

/** Whether his Done for today stopped work still open: it set aside a
 *  question or a problem, the lesson's plan has a step still to teach
 *  after the tutor's close marked what he finished, or the session, read
 *  up to just before he pressed it, waited on him or owed him a reply.
 *  `at` is the Done for today's index. Pure. */
function leftOpen(messages: readonly LhMessage[], at: number, tree: PlanTree | undefined, initial: SessionMode, topics: readonly string[]): boolean {
	let start = at;
	while (start > 0 && setAsideByDone(messages[start - 1]!)) start--;
	if (start < at || (tree && stepsLeft(tree, messages))) return true;
	const before = messages.slice(0, start);
	const end = before.length > 0 ? sessionEndOf(before, tree, initial, topics) : "closed";
	return end === "mid-lesson" || end === "cut";
}

/** What Done for today appends ahead of its marker for work it sets aside:
 *  a withheld question's dismissal, the dropped problem's marker and its
 *  synthesized conclude. */
function setAsideByDone(m: LhMessage): boolean {
	if (m.role === "custom") return m.customType === "problem-dismissed";
	if (m.role === "toolResult") return (m.details as { dismissed?: unknown } | null)?.dismissed === true || m.toolName === PRACTICE_CONCLUDE_TOOL;
	return m.role === "assistant" && m.content.length > 0 && m.content.every((b) => b.type === "toolCall" && b.name === PRACTICE_CONCLUDE_TOOL && (b.arguments as { outcome?: unknown } | null)?.outcome === "dismissed");
}

/** Whether a practice session in the pause between problems still owes
 *  him work: it was opened on topics, one of them he has not yet solved
 *  without a hint in it, and the tutor has not wrapped the round (its
 *  reply to his last Next problem posed nothing). A round he opened with
 *  no topics is his to end. Pure. */
function practiceUnfinished(messages: readonly LhMessage[], topics: readonly string[]): boolean {
	if (topics.length === 0 || wrapped(messages)) return false;
	const solved = new Set<string>();
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		for (const block of m.content) {
			if (block.type !== "toolCall" || block.name !== PRACTICE_CONCLUDE_TOOL) continue;
			const c = block.arguments as Partial<PracticeConclusion> | null;
			if (c?.outcome !== "solved" || !c.result) continue;
			const posed = problemInputForConclude(messages, block.id)?.topics;
			const on = Array.isArray(posed) ? posed.filter((t): t is string => typeof t === "string") : [];
			for (const [topic, result] of topicResults(on, { response: "", ...c, result: c.result })) if (result === "correct") solved.add(topic);
		}
	}
	return topics.some((topic) => !solved.has(topic));
}

/** The tutor wrapped the round: his latest input was Next problem, and
 *  nothing it said since posed a problem. Pure. */
function wrapped(messages: readonly LhMessage[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.name === PRACTICE_PROBLEM_TOOL)) return false;
		if (m.role !== "assistant" && nativeInputCause(m as never, messages.slice(0, i) as never) === "learner") return m.role === "custom" && m.customType === "practice-next";
	}
	return false;
}

/** Whether the lesson's plan has a step not yet taught: one no tagged
 *  question has moved past and no progress call marked done. Pure. */
function stepsLeft(tree: PlanTree, messages: readonly LhMessage[]): boolean {
	const { visited } = derivePlanStatusesLh(tree, messages);
	return tree.nodes.some((node) => !visited.has(node.id));
}

/** Whether a reply's last words are a question to him: its text ends in a
 *  question mark, past any closing markup. */
function asks(reply: Extract<LhMessage, { role: "assistant" }>): boolean {
	const text = reply.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
	return /\?[\s*_)\]"'”’$]*$/.test(text);
}

/** True when the session closed for tonight with no word from him since:
 *  the tutor's latest close (`lesson_progress` with `close: true`), or his
 *  own Done for tonight. His next message reopens the session. Pure. */
export function closedTonight(messages: readonly LhMessage[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "assistant") {
			if (m.stopReason === "error" || m.stopReason === "aborted") continue;
			if (m.content.some((b) => b.type === "toolCall" && b.name === LESSON_PROGRESS_TOOL && lessonProgressOf(b.arguments)?.close === true)) return true;
		} else if (nativeInputCause(m as never, messages.slice(0, i) as never) === "learner") {
			return isDoneTonight(m);
		}
	}
	return false;
}

/** True while his Done for tonight is his latest input: nothing he sent
 *  since reopened the session. Pure. */
export function doneTonightAtEnd(messages: readonly LhMessage[]): boolean {
	return doneTonightAt(messages) !== null;
}

/** Where his Done for today sits while it is his latest input, else null.
 *  Pure. */
function doneTonightAt(messages: readonly LhMessage[]): number | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (nativeInputCause(m as never, messages.slice(0, i) as never) === "learner") return isDoneTonight(m) ? i : null;
	}
	return null;
}

function isDoneTonight(m: LhMessage): boolean {
	return m.role === "custom" && m.customType === "done-tonight";
}
