import type { PlanTree } from "./contracts/plan.ts";
import { derivePlanStatusesLh, LESSON_PROGRESS_TOOL, lessonProgressOf } from "./contracts/plan.ts";
import type { SessionEnd, SessionMode } from "./contracts/chat.ts";
import { activeProblemOf, danglingQuestionOf, endsInDismissal, nativeInputCause, isQuestionRepose, needsContinuation, NEUTRAL_MARKERS, newQuestionRepose, PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, problemInputForConclude, sessionModeOf, sessionTaskStatesOf, type LhMessage } from "./native-messages.ts";
import { parseOptionsIfString, picksStop } from "./question-core.ts";
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
 * step it stopped on leads to another: "mid-lesson". A lesson moved to
 * practice waits on him at Next problem while its plan has steps left; any
 * other practice round between problems asks him nothing. His Done for
 * today on work still open (a question or problem it set aside, a task it
 * holds, a session that waited on him, or a round opened on topics, a
 * review or a topic's practice, one of which he has not yet solved without
 * a hint in it, unless the tutor wrapped it) leaves it for next time: "left". Words that
 * end without a question ("Good place to stop") end the session there,
 * like anything else, as does the tutor's own close, and a practice round
 * with its work done: "closed". The questions the app posed again after
 * his Done for today (`leftQuestionRepose`) are not the tutor's turn, so
 * they leave the session as it was: left. Pure.
 */
export function sessionEndOf(record: readonly LhMessage[], tree: PlanTree | undefined, initial: SessionMode = "teach", topics: readonly string[] = []): SessionEnd {
	const messages = record.at(-1) && isQuestionRepose(record.at(-1)!) ? record.slice(0, -1) : record;
	const last = [...messages].reverse().find((m) => !(m.role === "custom" && NEUTRAL_MARKERS.includes(m.customType)));
	if (!last) return "closed";
	const done = doneTonightAt(messages);
	if (done !== null && closeSettled(messages, last)) return leftOpen(messages, done, tree, initial, topics) ? "left" : "closed";
	if (last.role === "toolResult") {
		if (needsContinuation(messages)) return "cut";
		return endsInDismissal(messages) ? "mid-lesson" : "closed";
	}
	if (last.role !== "assistant" || last.stopReason !== "stop") return "cut";
	if (closedTonight(messages)) return "closed";
	// A practice round between problems asks him nothing: Next problem is his to press, so it is not his turn
	// (round 15, m7 and m8: Rank practice read "Your turn" after a dispute with nothing asked, a 5 Nov practice on
	// the calendar too). His Done for today still leaves its unfinished work for next time (`leftOpen`).
	if (sessionModeOf(messages, initial) === "practice") return tree && stepsLeft(tree, messages) ? "mid-lesson" : "closed";
	const phase = phaseAt3Lh(messages);
	if (phase === "plan") return "mid-lesson";
	if (phase !== "teach" || !tree) return "closed";
	const { current, done: taught } = derivePlanStatusesLh(tree, messages);
	// Every step taught: an offer in words with no question ("practice problems… are ready whenever you are") is
	// not his turn (round 17, m13: the card read "Your turn" with nothing to answer).
	if (tree.nodes.length > 0 && tree.nodes.every((node) => taught.has(node.id))) return asks(last) ? "mid-lesson" : "closed";
	if (current === null) return "mid-lesson";
	if (asks(last) && tree.edges.some((edge) => edge.from === current)) return "mid-lesson";
	// A turn that ended with no words of its own, no question and no close (`lesson_progress` with `close`), steps
	// still ahead, ended nowhere: the lesson is left where it stopped, never finished, so every surface keeps
	// "Continue … lesson · Left off today" (round 19, M2: after marking a prediction the tutor's turn stopped empty,
	// and the lesson left Home, the sidebar and its page's Now). A sign-off in its own words still ends it.
	return silent(last) && stepsLeft(tree, messages) ? "left" : "closed";
}

/** Whether a reply has no words of its own: what it said, if anything, went
 *  through `send_to_user` earlier in its turn. Pure. */
function silent(reply: Extract<LhMessage, { role: "assistant" }>): boolean {
	return !reply.content.some((block) => block.type === "text" && block.text.trim() !== "");
}

/** Whether the turn after his Done for today has settled, whatever it did
 *  past its close: it stopped, it ended at its closing words with nothing
 *  owed, or it posed something after the close he never asked for (round
 *  14, M1: a re-ask after the closing words read cut, so "Your turn"
 *  everywhere). A turn that failed, was stopped or ran tools it never
 *  answered still owes its close. Pure. */
function closeSettled(messages: readonly LhMessage[], last: LhMessage): boolean {
	if (last.role === "toolResult") return !needsContinuation(messages);
	if (last.role !== "assistant") return false;
	if (last.stopReason === "stop") return true;
	return last.stopReason === "toolUse" && (danglingQuestionOf(messages) !== null || activeProblemOf(messages) !== null);
}

/** Whether his Done for today stopped work still open: it set aside a
 *  question or a problem, the session still holds an open task
 *  (`sessionTasksOf`; round 12, 1 m10: a session that continued the
 *  Poisson lesson's task read finished, so Home put the task's own line
 *  back the day he said he was done), the lesson's plan has a step still
 *  to teach after the tutor's close marked what he finished, or the
 *  session, read up to just before he pressed it, waited on him or owed
 *  him a reply. Never once the session's own saves closed every task it
 *  held: the engine has the lesson as done, whatever step its plan named
 *  next (round 15, M1: the finished Eigen and Linear maps lessons came
 *  back as "Continue … lesson" every later day). His pick of the tutor's
 *  own "Stop here for today" is his Done for today, so the question it
 *  answered owes him nothing. `at` is the Done for today's index. Pure. */
function leftOpen(messages: readonly LhMessage[], at: number, tree: PlanTree | undefined, initial: SessionMode, topics: readonly string[]): boolean {
	// The turn's course brief rides just before the marker, after what it set aside.
	let start = at;
	let setAside = false;
	for (; start > 0; start--) {
		const m = messages[start - 1]!;
		if (m.role === "custom" && NEUTRAL_MARKERS.includes(m.customType)) continue;
		if (!setAsideByDone(m)) break;
		setAside = true;
	}
	if (setAside) return true;
	const tasks = [...sessionTaskStatesOf(messages).values()];
	if (tasks.some((open) => open)) return true;
	if (tasks.length > 0) return false;
	if (tree && stepsLeft(tree, messages)) return true;
	if (stopPicked(messages, start)) return false;
	const before = messages.slice(0, start);
	if (sessionModeOf(before, initial) === "practice" && !activeProblemOf(before) && practiceUnfinished(before, topics)) return true;
	const end = before.length > 0 ? sessionEndOf(before, tree, initial, topics) : "closed";
	return end === "mid-lesson" || end === "cut";
}

/** Whether the question waiting on him is the tutor's offer to go on: a
 *  choice one of whose options stops for today (`stops`). Nothing is asked
 *  of him, so the session is left where it is, "Left off today", and
 *  Home's Today lists no row for it (round 18, m4: "Practise eigenvalue
 *  problems now? 1 Yes… 2 Stop here for today" read "Your turn" on Home and
 *  in the sidebar). Pure. */
export function offersStop(messages: readonly LhMessage[]): boolean {
	const open = danglingQuestionOf(messages);
	if (open?.tool !== "ask_user_question") return false;
	const options = parseOptionsIfString((open.input as { options?: unknown } | null)?.options as string | undefined);
	return Array.isArray(options) && options.some((o) => (o as { stops?: unknown } | null)?.stops === true);
}

/** Whether the message before index `at` is his pick of an option the
 *  tutor marked as ending the session for today (`picksStop`), which the
 *  app sends as his Done for today (`inputAppends`). Pure. */
function stopPicked(messages: readonly LhMessage[], at: number): boolean {
	const answer = messages[at - 1];
	if (answer?.role !== "toolResult" || answer.toolName !== "ask_user_question") return false;
	const asked = messages.findLast((m) => m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.id === answer.toolCallId));
	const call = asked?.role === "assistant" ? asked.content.find((b) => b.type === "toolCall" && b.id === answer.toolCallId) : undefined;
	return call?.type === "toolCall" && picksStop(call.arguments, (answer.details ?? {}) as { answers?: ReadonlyArray<{ index?: number }> });
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

/** The questions he left open when he pressed Done for today, asked
 *  again when he next opens the session (`reposeLeftQuestions`): one
 *  app-made message whose calls pose each, as the tutor did, so the box
 *  serves it after Resume as before Done, Hint, Show me and his confidence
 *  included (round 12, 3 n10: they worked only once the tutor asked it
 *  again). Never under the closing words (round 14, M1: "Your turn" and the
 *  question again right after "We'll stop here for today"). No tutor turn
 *  poses it, and his Done for today stays his latest input. Empty unless
 *  that Done set a question aside, the close after it settled, and nothing
 *  is posed yet. Pure. */
export function leftQuestionRepose(messages: readonly LhMessage[]): LhMessage[] {
	const done = doneTonightAt(messages);
	if (done === null || danglingQuestionOf(messages)) return [];
	const last = messages.findLast((m) => !(m.role === "custom" && NEUTRAL_MARKERS.includes(m.customType)));
	if (!messages.some((m, i) => i > done && m.role === "assistant") || !last || !closeSettled(messages, last)) return [];
	const left: string[] = [];
	for (let i = done - 1; i >= 0; i--) {
		const m = messages[i]!;
		// The turn's course brief rides just before the marker.
		if (m.role === "custom" && NEUTRAL_MARKERS.includes(m.customType)) continue;
		if (m.role !== "toolResult") break;
		const details = m.details as { dismissed?: unknown; reason?: unknown } | undefined;
		if (details?.dismissed === true && details.reason === "tonight") left.unshift(m.toolCallId);
	}
	const calls = left.flatMap((id) => {
		const asked = messages.findLast((m) => m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.id === id));
		const call = asked?.role === "assistant" ? asked.content.find((b) => b.type === "toolCall" && b.id === id) : undefined;
		return call?.type === "toolCall" ? [{ tool: call.name, input: call.arguments }] : [];
	});
	return calls.length > 0 ? [newQuestionRepose(calls)] : [];
}

/** The question his Done for today set aside with a half answer in its
 *  box (`draftKept`), by its words, while that Done is his latest input;
 *  null when none did (round 19, m4: the Invertible lesson's task step
 *  said "You stopped before writing anything" over his kept half answer).
 *  Pure. */
export function halfAnswerLeft(messages: readonly LhMessage[]): string | null {
	const done = doneTonightAt(messages);
	if (done === null) return null;
	for (let i = done - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "custom" && NEUTRAL_MARKERS.includes(m.customType)) continue;
		if (m.role !== "toolResult") break;
		const details = m.details as { dismissed?: unknown; reason?: unknown; draft?: { text?: unknown } } | undefined;
		if (details?.dismissed !== true || details.reason !== "tonight" || typeof details.draft?.text !== "string" || !details.draft.text.trim()) continue;
		const asked = messages.findLast((a) => a.role === "assistant" && a.content.some((b) => b.type === "toolCall" && b.id === m.toolCallId));
		const call = asked?.role === "assistant" ? asked.content.find((b) => b.type === "toolCall" && b.id === m.toolCallId) : undefined;
		const words = call?.type === "toolCall" ? (call.arguments as { question?: unknown }).question : undefined;
		if (typeof words === "string" && words.trim()) return words;
	}
	return null;
}

/** The session since its last close: after its newest closing
 *  `lesson_progress` call or Done for today, the Done he just pressed
 *  aside (round 19, m15: a same-day resume's close named Mechanics,
 *  answered before the first close). Pure. */
export function sinceLastClose(messages: readonly LhMessage[]): readonly LhMessage[] {
	const current = doneTonightAt(messages);
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		const closed = m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.name === LESSON_PROGRESS_TOOL && (b.arguments as { close?: unknown } | null)?.close === true);
		if (closed || (i !== current && isDoneTonight(m))) return messages.slice(i + 1);
	}
	return messages;
}

function isDoneTonight(m: LhMessage): boolean {
	return m.role === "custom" && m.customType === "done-tonight";
}
