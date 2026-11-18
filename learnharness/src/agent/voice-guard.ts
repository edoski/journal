/**
 * The voice, held per turn (spec: src/agent/prompts/shared/10-voice.md).
 * Each message the tutor sends with `send_to_user`, and each question it
 * poses, is read with the voice checker before he sees it. One that breaks
 * the voice is refused with what to fix, and the tutor rewrites it in the
 * same turn; he sees only the rewrite. Each kind of call is refused twice a
 * turn at most (a rewrite is read against every rule again, round 8: a
 * length rewrite glued sentences, a verdict rewrite opened on a formula),
 * then only the hard rules hold, so a rewrite that still slips is shown
 * rather than looped.
 *
 * A refused message never shows: `screen` runs as the call finishes
 * streaming, before any view reads it, and takes its text out of the live
 * call (the refusal's details keep it). A refused question never showed:
 * the question dock waits for the call's result.
 *
 * One refused call never refuses the next well-formed one, whatever rule
 * refused it (round 12, 3 M1: 25 of the evaluators' 81 refusals were a
 * question refused only because the message before it was). A question
 * sent beside a refused message is read by its own rules and, well-formed,
 * kept: `settle` takes it out of the reply that asked it and poses it under
 * the rewrite once that passes, which ends the turn. Any other turn-ending
 * call (a handoff, a problem's pose, the probe's end) runs where it was
 * called, and the rewrite ends the turn it began. A refused message with
 * nothing for him (a narrated handoff) may be dropped: after one note the
 * turn ends, and what was kept or ran still reaches him.
 *
 * Ordinary text never reaches him (round 7: an answer written as plain
 * text skipped every rule): `screenText` takes it out of the reply as it
 * ends, and a turn that would end having given him nothing of what it
 * wrote is told to send it with `send_to_user`, where it is read like any
 * message (`beforeEnd`).
 */

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolCall } from "@earendil-works/pi-ai";
import { QUESTION_TOOLS } from "../core/pending.ts";
import { LESSON_PROGRESS_TOOL } from "../core/contracts/plan.ts";
import { normalizeQuestionType, PREDICT_RULE } from "../core/question-core.ts";
import { sameQuestionKey } from "../core/shown-help.ts";
import { parseQuestionInput } from "../core/tool-parts.ts";
import { parseMermaidPlan } from "./tools/mermaid-plan.ts";
import { answeredQuestionsOf, GRADED_QUESTION_TOOLS, HIS_MESSAGE, isRealAnswer, nativeInputCause, opensTurn, PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, savedQuestionsOf, SEND_TO_USER_TOOL, UNGRADED_ANSWER, failedOutputCallIds, sendToUserText, type LhMessage } from "../core/native-messages.ts";
import { adviceSentences, partialDay, pointsBack, afterQuestion, creditedLetter, asksAreHis, reasonAskedTwice, recordConfidenceWord, recordMarkWords, clausesOf, closingMoral, compoundAsk, echoOf, heavySentences, leavesAWayOn, narratedConfidence, problemAdvice, questionBelow, restatingCallout, reusedLetter, repeatedAdvice, repeatedPoint, restatesWithoutReason, SENTENCE_WORDS, sentences, voiceBreaks, type TurnKind, type VoiceBreak, type VoiceRule } from "../core/voice-check.ts";

type Family = "message" | "question";

const PROBE_DONE_TOOL = "probe_done";

/** The words that give a topic's planned day. */
const PLANNED_DAY = /^(?:is planned for|planned to start)$/i;

/** His question is about the plan: when something comes back, is due or
 *  overdue, the exam, the days ahead. */
const PLAN_QUESTION = /\b(?:reviews?|plan(?:ned)?|overdue|due|exam|when|days?|schedule|calendar|week|tomorrow)\b/i;

/** What the turn's input asks of the replies to it: the kind of turn its
 *  first message is (no kind: no length budget), and his words when it
 *  answers something of his, which a reply must not hand back. */
export interface TurnInput {
	kind: TurnKind | undefined;
	answers: boolean;
	words: string | null;
	/** Practice handed the session back to teaching (Explain instead, or a
	 *  request to be taught): the turn must leave him something to do. */
	handedBack?: boolean;
	/** He answered unsure (marked it a guess, or said he doesn't see why):
	 *  the reply owes him words before any next question (round 8: a right
	 *  guess and "Not sure why I'm allowed to split T" got none). */
	unsure?: string;
	/** His work on a problem, which a reply leaves open: the reply ends on
	 *  a way on (round 8: photo feedback stopped on the faulty line). */
	work?: boolean;
	/** A ruling on his dispute of a mark: each ruling is news, however much
	 *  it reads like an earlier one ("The mark stays …"). */
	ruling?: boolean;
	/** His message asks to guess first ("let me guess first"): the guess
	 *  is a prediction, never a counted attempt (round 12, 2 M1). */
	guess?: string;
	/** He pressed Hint on a practice problem: its rung sets the length, and
	 *  the hint is a statement, as a check's is (round 15, m16). */
	hint?: boolean;
	/** A demo the tutor called for has just been built and drawn in the
	 *  lesson: the turn's first message points him into it (round 14, m13:
	 *  the slots demo landed above a reply that never mentioned it). */
	demo?: boolean;
}

/** Words that send him into a demo: the demo itself, or what to do with
 *  one of its controls. */
const POINTS_AT_DEMO = /\bdemos?\b|\b(?:slide|slider|drag|press|click|tap|set|move|watch|turn|sweep|play|toggle|run)\b/i;

/** His words asking to guess before he is told: "let me guess first",
 *  "can I guess", "I want to predict it". */
const GUESS_ASK = /\b(?:let me|i(?:'ll| will| want to| wanna|'d like to| would like to)|can i|could i|may i)\s+(?:first\s+)?(?:try\s+(?:to\s+)?|have\s+a\s+|take\s+a\s+|make\s+a\s+)?(?:guess|predict)\b|\b(?:guess|predict)(?:ing)?\s+first\b/i;

/** The tutor's words inviting a guess: "Go ahead, guess.", "Take a guess",
 *  "What's your guess?", "Make a prediction". Never words about a guess
 *  he already made ("your guess fails there"). */
const GUESS_INVITE = /\b(?:go ahead(?:,| and)?\s+guess|guess (?:first|away)|(?:take|make|have) a (?:quick |first )?guess|what(?:'s| is| would be) your (?:best )?guess|what would you guess|(?:make|give) (?:me )?(?:a|your) prediction)\b/i;

/** A question's words asking for his guess, as his box does ("Your
 *  prediction, and why"): "What do you expect…", "Guess…", "Before
 *  computing anything…". */
const ASKS_A_GUESS = /\b(?:guess(?:es|ing)?|expect(?:s|ed|ing)?|predict(?:s|ion)?|hunch|bet|intuition|instinct|suspect)\b|\bwhat do you (?:think|imagine)\b|\bbefore (?:computing|calculating|working|checking|trying|we|you)\b/i;

/** Words in his answer that say he is not sure of it or of its reason. */
const DOUBT = /\b(?:not sure|unsure|no idea|i think|i guess|i'?m guessing|maybe|probably|don'?t (?:know|see|get)|why (?:i'?m|am i|is it|does it|can i))\b/i;

/** Why his answer reads unsure, or undefined. */
function unsureOf(details: Record<string, unknown>, words: string | null): string | undefined {
	const said = words ? DOUBT.exec(words) : null;
	if (said) return `he wrote "${said[0]}"`;
	return details.confidence === "guessing" ? "he marked his answer a guess" : undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.flatMap((p) => (isRecord(p) && p.type === "text" && typeof p.text === "string" ? [p.text] : [])).join("\n");
}

/** Practice handed the session back to teaching, and since then he wrote
 *  nothing of his own and no handoff went back to practice. */
function afterHandBack(messages: readonly LhMessage[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "user") return false;
		if (m.role === "toolResult" && m.toolName === "practice" && !m.isError) return false;
		if (m.role === "custom" && m.customType === "mode-handoff") return isRecord(m.details) && m.details.mode === "teach";
	}
	return false;
}

/** The turn's input, read from the last message that opens a turn. */
export function turnInputOf(messages: readonly LhMessage[]): TurnInput {
	const at = messages.findLastIndex(opensTurn);
	const input = messages[at];
	const none: TurnInput = { kind: "teach", answers: false, words: null };
	if (!input) return none;
	if (input.role === "user") {
		// A session's first message is the topic it opens on, unless he asks.
		const words = textOf(input.content);
		const opens = !messages.slice(0, at).some((m) => m.role === "assistant") && !words.trim().endsWith("?");
		const guess = GUESS_ASK.exec(words)?.[0];
		return { kind: opens ? "teach" : "direct", answers: false, words, ...(guess ? { guess } : {}) };
	}
	if (input.role === "toolResult") {
		const details = isRecord(input.details) ? input.details : {};
		// His answer to the check after practice handed back: he still needs a way on.
		const handedBack = afterHandBack(messages.slice(0, at)) ? { handedBack: true } : {};
		if (details.hintRequested === true) return { kind: "hint", answers: false, words: null };
		// A shown answer sets its own length, as a shown solution does.
		if (details.showMe === true) return { kind: undefined, answers: false, words: null };
		const words = typeof details.text === "string" ? details.text : textOf(input.content);
		const unsure = unsureOf(details, words);
		return { kind: "wrong", answers: true, words, ...handedBack, ...(unsure ? { unsure } : {}) };
	}
	if (input.role !== "custom") return none;
	switch (input.customType) {
		case "done-tonight":
		case "practice-next":
			return { kind: "close", answers: false, words: null };
		case "practice-thinking":
			return { kind: "wrong", answers: true, words: textOf(input.content), work: true };
		case "practice-request": {
			// A hint's rung and a shown solution set their own length.
			const request = isRecord(input.details) ? input.details.request : undefined;
			return { kind: request === "explain" ? "teach" : undefined, answers: false, words: null, ...(request === "hint" ? { hint: true } : {}) };
		}
		case UNGRADED_ANSWER:
			return { kind: "wrong", answers: true, words: textOf(input.content) };
		case "dispute":
			return { kind: "direct", answers: false, words: null, ruling: true };
		case "subagent-steer": {
			const result = isRecord(input.details) && input.details.kind === "demo" && isRecord(input.details.result) ? input.details.result : null;
			return typeof result?.html === "string" && result.html.length > 0 ? { kind: "teach", answers: false, words: null, demo: true } : none;
		}
		case "mode-handoff":
			return isRecord(input.details) && input.details.mode === "teach" ? { kind: "teach", answers: false, words: null, handedBack: true } : none;
		default:
			return none;
	}
}

/** Everything he wrote this session: his messages, his answers to its
 *  questions and his work on its problems. */
function hisWordsOf(messages: readonly LhMessage[]): string[] {
	return messages.flatMap((m) => {
		if (m.role === "user") return [textOf(m.content)];
		if (m.role === "toolResult" && (QUESTION_TOOLS as readonly string[]).includes(m.toolName) && isRecord(m.details) && typeof m.details.text === "string") return [m.details.text];
		if (m.role === "custom" && m.customType === "practice-thinking") return [textOf(m.content)];
		return [];
	});
}

/** Whether the last question he was asked before this turn is still open:
 *  no answer came back, or he set it aside (Hint, Ask, Done for today). */
function standingQuestion(messages: readonly LhMessage[]): boolean {
	const failed = failedOutputCallIds(messages);
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role !== "assistant") continue;
		const call = m.content.findLast((b): b is ToolCall => b.type === "toolCall" && (QUESTION_TOOLS as readonly string[]).includes(b.name) && !failed.has(b.id));
		if (!call) continue;
		const result = messages.find((r) => r.role === "toolResult" && r.toolCallId === call.id);
		return result?.role !== "toolResult" || !isRealAnswer(result.details);
	}
	return false;
}

/** Whether the last thing he read before this turn is a question or a
 *  problem still open: nothing of his came after it, and nothing the
 *  tutor showed him. A pointer to it then points at the line right above
 *  (round 15, m14: "Your rank problem on the matrix M is still open
 *  above." directly under M). */
function posedLast(messages: readonly LhMessage[]): boolean {
	const failed = failedOutputCallIds(messages);
	const posing: readonly string[] = [...QUESTION_TOOLS, PRACTICE_PROBLEM_TOOL];
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role !== "assistant") {
			if (nativeInputCause(m as never, messages.slice(0, i) as never) === "learner") return false;
			continue;
		}
		const shown = m.content.findLast((b): b is ToolCall => b.type === "toolCall" && !failed.has(b.id) && (posing.includes(b.name) || b.name === PRACTICE_CONCLUDE_TOOL || (b.name === SEND_TO_USER_TOOL && !!sendToUserText(b))));
		if (shown) return posing.includes(shown.name);
	}
	return false;
}

/** Every text he read from the tutor before this turn: its delivered
 *  messages and the questions it posed, each marked which it is. */
function earlierTexts(messages: readonly LhMessage[]): Array<{ text: string; asked: boolean }> {
	const failed = failedOutputCallIds(messages);
	return messages.flatMap((m) =>
		m.role !== "assistant"
			? []
			: m.content.flatMap((b) => {
					if (b.type !== "toolCall" || failed.has(b.id)) return [];
					const asked = (QUESTION_TOOLS as readonly string[]).includes(b.name);
					const text = b.name === SEND_TO_USER_TOOL ? sendToUserText(b) : asked ? questionText(b) : undefined;
					return text ? [{ text, asked }] : [];
				}),
	);
}

function questionText(call: Pick<ToolCall, "arguments">): string | undefined {
	const q = isRecord(call.arguments) ? call.arguments.question : undefined;
	return typeof q === "string" && q.trim() ? q : undefined;
}

const KIND_WORDS: Readonly<Record<TurnKind, string>> = {
	teach: "a teaching turn",
	right: "a reply to a right answer",
	wrong: "a reply to his answer",
	hint: "a hint",
	direct: "a direct answer to his question",
	close: "a close",
};

/** The rules a rewrite is still read against after its call was refused
 *  once: a question asks one thing, so no rewrite passes by asking two
 *  (round 7: a rewrite that fixed advice added a second question). */
const HARD: ReadonlySet<VoiceRule> = new Set(["questions", "compound", "verdict", "guess", "predict"]);

const SAVE_TOOL = "course_save";

/** Words about a mark he did not dispute: that it looks wrong, that it
 *  could change, or how to dispute it (round 17, m18: "I can't change
 *  those two card marks myself, but disputing them from the cards gets
 *  them re-marked."). */
const MARK_TALK = /\bre-mark(?:ed|ing|s)?\b|\bdisput(?:e|ed|es|ing)\b|\b(?:change|fix|correct)(?:s|ed|ing)? (?:(?:those|these|the|its|their|your|that|this|two|both|earlier|card)\s+)*marks?\b|\bmarks? (?:are|is|was|were|look|looks) (?:wrong|off|mistaken)\b|\bkeeps? (?:their|its) marks?\b/i;
/** His words about a mark: then a reply may answer them. */
const HIS_MARK_WORDS = /\b(?:mark(?:s|ed)?|dispute|re-?mark|card)\b/i;
/** A reply that says how his answer was judged. */
const VERDICT_SAID = /\b(?:right|correct|wrong|incorrect)\b/i;

/** Words that start the lesson he is closing (round 17, m19: "…waits
 *  for you in Linear maps and their matrices, which you start tomorrow"
 *  closing a lesson he began that morning). */
const STARTS_IT = /\b(?:which|that) you (?:start|begin)\b|\byou (?:start|begin) (?:it|this(?: lesson)?|the lesson)\b/i;

/** Words that tell him reviews are due: "your Binomial distribution
 *  review is still due today", "due today: your Kernel review". */
const DUE_REVIEWS = /\breviews?\b[^.?!]{0,40}?\b(?:still )?(?:over)?due\b|\b(?:over)?due (?:today|now)\b[^.?!]{0,60}?\breviews?\b/i;

/** The session called a lesson, which a review never is (round 9, 2 m4:
 *  the Binomial review closed on "the binomial lesson"). */
const SESSION_AS_LESSON = /\b(?:this|today'?s|the|our|your)(?: [a-z]+)? lesson\b/i;

/** A reply that calls his whole answer wrong: "That's not right.", "Not
 *  right: …", "No, …", with no part named right ("but", "partly"). */
const FLAT_MISS = /^(?:(?:that|this|it)(?:'s| is) not (?:right|correct)\b|not (?:quite )?(?:right|correct)\b|no(?=[,.]))(?![^.?!]*\b(?:but|partly|part of)\b)/i;

/** An opening that restates the verdict his answer card shows above the
 *  reply, by the result this turn saved (round 14, m19: "That's not
 *  right." under a "Not right" card). */
const RESTATED_VERDICT: Readonly<Record<string, { card: string; re: RegExp }>> = {
	incorrect: { card: "Not right", re: /^(?:no[,.]\s+)?(?:(?:that|this|it|your answer)(?:'s| is) (?:not (?:quite )?(?:right|correct)|wrong|incorrect)|not (?:quite )?(?:right|correct)|wrong|incorrect)\b/i },
	partial: { card: "Partly right", re: /^(?:(?:that|this|it|your answer)(?:'s| is) )?(?:only )?(?:partly|partially|half) (?:right|correct)\b/i },
};

/** The observations a save writes for his answers, corrections aside. */
function savedObservations(args: Record<string, unknown>): Record<string, unknown>[] {
	let changes: unknown = args.changes;
	if (typeof changes === "string") {
		try {
			changes = JSON.parse(changes);
		} catch {
			return [];
		}
	}
	const listed = isRecord(changes) && Array.isArray(changes.observations) ? changes.observations : [];
	return listed.filter((o): o is Record<string, unknown> => isRecord(o) && !("corrects" in o));
}

/** The results a save or a conclude records for his answers. */
function savedResults(name: string, args: unknown): string[] {
	if (!isRecord(args)) return [];
	if (name === PRACTICE_CONCLUDE_TOOL) return typeof args.result === "string" ? [args.result] : [];
	return savedObservations(args).flatMap((o) => (typeof o.result === "string" ? [o.result] : []));
}

/** Whether a save records the answer `question` names as not right. */
function savedNotRight(args: unknown, question: string): boolean {
	if (!isRecord(args)) return false;
	return savedObservations(args).some((o) => o.question === question && (o.result === "incorrect" || o.result === "partial"));
}

/** His answer opening this turn, when it is his first try at a lesson's
 *  check: a real answer, not a Show me, to an `explain` that is no
 *  prediction, whose words he had not answered before. Only the teacher
 *  asks with `explain` (the probe asks with `recall`). */
function firstTryAtCheck(messages: readonly LhMessage[]): { id: string; question: string } | null {
	const input = messages[messages.findLastIndex(opensTurn)];
	if (input?.role !== "toolResult" || input.isError || input.toolName !== "explain" || !isRealAnswer(input.details)) return null;
	const answered = answeredQuestionsOf(messages);
	const answer = answered.get(input.toolCallId);
	if (!answer?.asked || answer.predicted || answer.showMe) return null;
	for (const [id, other] of answered) if (id !== input.toolCallId && other.tool === "explain" && other.asked === answer.asked) return null;
	return { id: input.toolCallId, question: answer.asked };
}

/** His answer opening this turn, when it is a later try at a lesson's
 *  check he had answered before: the check's call and its right answer
 *  (`correctAnswer`). Null for a first try, a prediction or a Show me. */
function retryAtCheck(messages: readonly LhMessage[]): { id: string; correct: string; question: string } | null {
	const input = messages[messages.findLastIndex(opensTurn)];
	if (input?.role !== "toolResult" || input.isError || input.toolName !== "explain" || !isRealAnswer(input.details)) return null;
	const answered = answeredQuestionsOf(messages);
	const answer = answered.get(input.toolCallId);
	if (!answer?.asked || answer.predicted || answer.showMe) return null;
	if (![...answered].some(([id, other]) => id !== input.toolCallId && other.tool === "explain" && other.asked === answer.asked)) return null;
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		const call = m.content.find((b): b is ToolCall => b.type === "toolCall" && b.id === input.toolCallId);
		const correct = call && isRecord(call.arguments) ? call.arguments.correctAnswer : undefined;
		if (call) return typeof correct === "string" && correct.trim() ? { id: input.toolCallId, correct, question: questionText(call) ?? "" } : null;
	}
	return null;
}

const INLINE_OR_DISPLAY = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\$([^$\n]+)\$/g;
/** TeX read for its content: spacing, sizing and the matrix's bracket aside. */
const texKey = (tex: string) => tex.replace(/\\(?:left|right|big|Big|,|;|!|quad|qquad)(?![a-zA-Z])/g, "").replace(/\\(?:dfrac|tfrac)/g, "\\frac").replace(/[pbvBV]?matrix\}/g, "matrix}").replace(/\s+/g, "");
const mathsOf = (text: string) => [...text.matchAll(INLINE_OR_DISPLAY)].map((m) => texKey(m[1] ?? m[2] ?? m[3] ?? "")).filter(Boolean);

/** Whether `said` writes out a right answer's maths: one of its matrices
 *  the question did not already show, or the value its last relation
 *  gives (the side after its last "="), as a whole side of a relation he
 *  reads. True when the right answer has no maths to look for. */
function writesAnswer({ correct, question }: { correct: string; question: string }, said: readonly string[]): boolean {
	const maths = mathsOf(correct);
	if (maths.length === 0) return true;
	const given = new Set(mathsOf(question).flatMap((t) => [...t.matchAll(MATRIX)].map((m) => texKey(m[0]))));
	const matrices = maths.flatMap((t) => [...t.matchAll(MATRIX)].map((m) => texKey(m[0]))).filter((m) => !given.has(m));
	const wanted = matrices.length > 0 ? matrices : maths.map((t) => t.split("=").at(-1)!).filter(Boolean);
	const shown = said.flatMap(mathsOf);
	const sides = new Set(shown.flatMap((t) => [t, ...t.split("=")]));
	return wanted.some((w) => (w.length >= 6 ? shown.some((t) => t.includes(w)) : sides.has(w)));
}

/** A question posed after a second miss whose repair never wrote the
 *  right answer (round 17, m16: "What is A⁻¹?" got a break, a rule and a
 *  twin, never (0 1; −1 0)). */
const REPAIRED = (correct: string): AgentToolResult<unknown> => ({
	content: [
		{
			type: "text",
			text: `Not posed: his second try at your check was not right either, and your repair never writes its right answer. Send him with send_to_user the repair ending on the right answer, written out in its maths: ${JSON.stringify(correct)}. Then ask your next question.`,
		},
	],
	isError: true,
	details: { withheld: "repaired" },
});
const VERDICT_NOTE = "His answer's save failed, so his card shows no mark, and nothing you sent says how his answer was judged. Send him the verdict in words, opening on it (\"Right, …\", \"Not right: …\").";
const REPAIRED_NOTE = "His second try at your check was not right either, and nothing you sent writes its right answer. Send the repair ending on the right answer, written out in its maths.";

/** The rulings a save records on a dispute (`ruling` on each re-mark). */
function savedRulings(args: unknown): string[] {
	if (!isRecord(args)) return [];
	let changes: unknown = args.changes;
	if (typeof changes === "string") {
		try {
			changes = JSON.parse(changes);
		} catch {
			return [];
		}
	}
	const listed = isRecord(changes) && Array.isArray(changes.observations) ? changes.observations : [];
	return listed.flatMap((o) => (isRecord(o) && typeof o.ruling === "string" ? [o.ruling] : []));
}

/** A ruling saved in the record's confidence word, not his card's: the
 *  card's "Disputed:" line would read "sure" beside "Confident". */
const RULING_WORDS = (slip: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: `Not saved: the ruling words his confidence as the record does, "${slip}", but his card says "Guessing" or "Confident". Send the save again with the ruling in the card's words.` }],
	isError: true,
	details: { withheld: "card-words" },
});

/** A ruling with the card's word capitalised inside its sentence: his
 *  card's Disputed line would read "stands as With help" (round 15, m18). */
const RULING_CASE = (word: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: `Not saved: the ruling capitalises his card's word "${word}" inside its sentence. Inside a sentence the card's words are plain lowercase words ("it stays with help"). Send the save again with them lowercase.` }],
	isError: true,
	details: { withheld: "mark-case" },
});

/** A ruling as the reply and the card compare it: case, spacing and the
 *  closing stop aside. Whether `message` says `ruling` word for word. */
function sameRuling(message: string, ruling: string): boolean {
	const plain = (t: string) => t.toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
	const said = plain(ruling);
	return said.length > 0 && plain(message).includes(said);
}

/** His card's Disputed stamp shows the saved ruling: the reply tells him
 *  the same words (round 13, 2 n6: the reply said "so the answer counts as
 *  given after help", the stamp "so your answer came after help on the
 *  very part that was missing"). */
const RULING_SAID = (ruling: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: `Not shown to him: his answer card shows the ruling you saved, "${ruling}", and your reply words it differently, so he would read two rulings. Send your ruling as you saved it, word for word.` }],
	isError: true,
	details: { withheld: "ruling-said" },
});
const RULING_UNSAID = (ruling: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: `Not saved: his answer card shows \`ruling\` as his Disputed stamp, and "${ruling}" words it differently from the ruling you told him, so he would read two rulings. Send the save again with \`ruling\` the words you told him, word for word.` }],
	isError: true,
	details: { withheld: "ruling-said" },
});

const DEMO_TOOL = "demo";

/** Words that point at a demo or its controls. */
const DEMO_WORD = /\bdemo(?:'s|s)?\b/i;

/** Maths as a key that ignores how it was typed: TeX or Unicode, spaces,
 *  braces and `\\left`/`\\right` aside, so "(1 − λ/n)^n" in a brief and
 *  "$(1-\\lambda/n)^n$" in a step's title read the same. */
function formulaKey(text: string): string {
	return text
		.replace(/\\(?:left|right|,|;|!|quad|qquad)(?![A-Za-z])/g, "")
		.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
		.replace(/\\lambda(?![A-Za-z])/g, "λ").replace(/\\mu(?![A-Za-z])/g, "μ").replace(/\\sigma(?![A-Za-z])/g, "σ").replace(/\\theta(?![A-Za-z])/g, "θ")
		.replace(/[−–]/g, "-")
		.replace(/[\s${}]/g, "")
		.toLowerCase();
}

/** The formulas a step's title names, each as a key. */
function formulasOf(title: string): string[] {
	return [...title.matchAll(/\$([^$]+)\$/g)].map((m) => formulaKey(m[1]!));
}

/** The latest plan's steps that no `lesson_progress` has marked done. */
function stepsNotDone(messages: readonly LhMessage[]): Array<{ id: string; title: string }> {
	const failed = failedOutputCallIds(messages);
	let steps: Array<{ id: string; title: string }> = [];
	const done = new Set<string>();
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		for (const b of m.content) {
			if (b.type !== "toolCall" || failed.has(b.id) || !isRecord(b.arguments)) continue;
			if (b.name === "plan_init" && typeof b.arguments.mermaid === "string") {
				const plan = parseMermaidPlan(b.arguments.mermaid).plan;
				if (plan) steps = plan.nodes.map((node) => ({ id: node.id, title: node.title }));
			} else if (b.name === "lesson_progress" && Array.isArray(b.arguments.done)) {
				for (const id of b.arguments.done) if (typeof id === "string") done.add(id);
			}
		}
	}
	return steps.filter((step) => !done.has(step.id));
}

/** A demo brief that prints a step ahead's formula. */
const DEMO_GIVES_AWAY = (title: string): AgentToolResult<unknown> => ({
	content: [
		{
			type: "text",
			text: `Not built: the brief prints the formula of "${title}", a step he has not done yet, so the demo would hand him what the lesson is about to ask. A demo shows what he has been taught and lets him find the rest: label each control and readout by what it is ("chance per slot"), never by a formula or value he is still to find, and send the brief again.`,
		},
	],
	isError: true,
	details: { withheld: "demo-gives-away" },
});

/** A save of a partly right answer after he was told it was not right:
 *  the mark under the card would contradict the words above it (round 7:
 *  "Partly right" under "That's not right."). */
const SAVED_AGAINST_WORDS: AgentToolResult<unknown> = {
	content: [{ type: "text", text: "Not saved: your message told him his answer is not right, so it is not partly right. Save it with result incorrect." }],
	isError: true,
	details: { withheld: "verdict" },
};

/** An ask for the reason of the answer beside it: "explain why…", "say how
 *  you got it", "justify it". */
const REASON_ASK = /^(?:explain|say|justify|give|state)\b[^.?!]*\b(?:why|how|reason)\b|^(?:explain|justify) (?:it|this|that|your)\b|^why\b/i;

/** Words under a question that ask for his reason or his working ("Say
 *  why.", "Justify your answer.", "Show how you get it."): the reason
 *  belongs in the question, as ", and why?" (round 10: told only "no
 *  advice", the rewrite asked it as a second clause and was refused again). */
const REASON_UNDER = /\b(?:why|reasons?|justify|explain|show how|how you (?:got|get)|accounts? for)\b/i;

const quoted = (text: string) => `"${text.length > 160 ? `${text.slice(0, 157)}…` : text}"`;

/** What to fix for each break, in the voice's own terms. */
export function fixFor(b: VoiceBreak, kind: TurnKind | undefined, text: string): string {
	switch (b.rule) {
		case "praise":
			return `No praise or performed reaction: ${quoted(b.excerpt)}.`;
		case "preview":
			return `No preview of what comes next: ${quoted(b.excerpt)}.`;
		case "narration":
			return `Never narrate what you do, save or wait for: ${quoted(b.excerpt)}.`;
		case "plan":
			return `Never tell him the plan, the order, why you ask, or a planned day that puts off what he asked: ${quoted(b.excerpt)}.`;
		case "offer":
			return `No offer here: ${quoted(b.excerpt)}.`;
		case "comprehension":
			return `Never ask whether it makes sense: ${quoted(b.excerpt)}.`;
		case "operand":
			return `An operator stands alone, acting on nothing: ${quoted(b.excerpt)}. Write what it acts on ("$\\operatorname{im} A$"), or say it in words ("the image of A").`;
		case "reprint":
			return `His open question stays above as it was, and the app shows no copy of it: ${quoted(b.excerpt)}. Say it is still open above ("Your question is still open above."), never that you give it again.`;
		case "below":
			return `His open question is above this message, where he reads it, never below: ${quoted(b.excerpt)}. Say it is still open above, or name the question with no direction.`;
		case "pointer":
			return `His open question is the last thing he reads, right above this message, so a pointer to it tells him nothing: ${quoted(b.excerpt)}. Leave it out, and send nothing when nothing else is left to say.`;
		case "arrival":
			return `His answer's card already shows it came and how it was marked: ${quoted(b.excerpt)}. Leave the line out; when he asked whether it went through, the mark under his answer says so.`;
		case "own-words":
			return `Never talk about your own earlier words: ${quoted(b.excerpt)}. When what you said earlier changes what he should do, say what is true as itself ("This problem is the first of the set."); otherwise leave it out.`;
		case "mark-case":
			return `His card's words inside a sentence are plain lowercase words, not the card's capitals: ${quoted(b.excerpt)}. Write them lowercase ("it stays with help").`;
		case "machinery":
			return `Never name the app's parts or how his words reached you: ${quoted(b.excerpt)}. Speak to what he wrote.`;
		case "exclamation":
			return "No exclamation marks.";
		case "dash":
			return `No em or en dashes; use a period or a comma: ${quoted(b.excerpt)}.`;
		case "headings":
			return "No headings.";
		case "questions":
			return `One question per turn, and this turn asks more: ${quoted(b.excerpt)}. Ask the first alone; the rest waits for his answer.`;
		case "verdict":
			return `You saved his answer as partly right, so never call it not right: open with the part that is right, then where it broke: ${quoted(b.excerpt)}.`;
		case "compound": {
			const asks = b.excerpt.split(" / ");
			// A reason asked beside the answer is one ask, said "…, and why?"
			// (round 8: the rewrite read "with the reason the formula counts it?").
			const reason = asks.slice(1).every((a) => REASON_ASK.test(a));
			return reason
				? `One question asks one thing, and this one asks more: ${asks.map(quoted).join(", ")}. A reason asked with the answer is part of it: end the first ask with ", and why?".`
				: `One question asks one thing, and this one asks more: ${asks.map(quoted).join(", ")}. Ask the first alone; the rest waits for his answer.`;
		}
		case "length": {
			const what = kind ? KIND_WORDS[kind] : "one turn";
			if (b.excerpt.startsWith("joined: ")) return `It is still too long for ${what}: it joins sentences the draft had apart and cuts almost nothing (${b.excerpt.slice("joined: ".length)}). Cut a whole sentence instead.`;
			const heavy = heavySentences(text).map((h) => `${quoted(h.sentence)} is ${[h.words > SENTENCE_WORDS ? `${h.words} words` : null, h.joins > 0 ? `${h.joins + 1} clauses joined by a colon or a semicolon` : null].filter(Boolean).join(" and ")}`);
			const counted = heavy.length > 0 ? ` A sentence over ${SENTENCE_WORDS} words counts as two, and each clause after a colon or a semicolon as one more: ${heavy.join("; ")}.` : "";
			return `It is too long for ${what} (${b.excerpt}).${counted} Keep the one idea: cut whole sentences, or cut a long one to ${SENTENCE_WORDS} words or fewer; never join two.`;
		}
		case "options":
			return `An option that joins others is a choice of several: drop ${quoted(b.excerpt)} and set multiSelect, so he picks each he wants.`;
		case "symbol":
			return `Never start a sentence with a symbol or a formula; open it with words: ${quoted(b.excerpt)}.`;
		case "displays":
			return `Too many displays for ${kind ? KIND_WORDS[kind] : "one turn"} (${b.excerpt}).`;
		case "advice":
			return REASON_UNDER.test(b.excerpt)
				? `A question is its own words with nothing under them: ${quoted(b.excerpt)}. To ask for his reason, end the question itself with ", and why?".`
				: `A question is its own words with nothing under them: no advice on how to answer it, ${quoted(b.excerpt)}.`;
		case "repeat":
			if (b.excerpt.startsWith("display ")) return `He has already seen ${b.excerpt.slice("display ".length)} earlier in the session, and what he was told is said once: build on it with a new case, never show or explain it again.`;
			if (b.excerpt.startsWith("callout ")) return `A callout holds what the message has not said, and this one says again what the paragraph above it said: ${b.excerpt.slice("callout ".length)}. Drop the callout, or the sentence it restates.`;
			if (b.excerpt.startsWith("point ")) return `He was already told this earlier in the session, and a point is made once: ${b.excerpt.slice("point ".length)}. Leave it out; say only what is new.`;
			return `This advice was given earlier in the session, and advice is said once: ${b.excerpt}. Leave it out.`;
		case "colon":
			return `A colon goes only before a display, a list or a definition's body: end the verdict with a full stop and give the reason as its own sentence: ${quoted(b.excerpt)}.`;
		case "backref":
			return `Say the thing itself, never point back to an earlier one, which he must check against the screen: ${quoted(b.excerpt)}.`;
		case "chain":
			return `One relation per display: this one chains different relations, ${quoted(b.excerpt)}. Give each relation its own display line, or say the step in words.`;
		case "moral":
			return `A direct answer stops where the answer does, with no closing lesson: drop ${quoted(b.excerpt)}.`;
		case "reason":
			return `He was unsure of his answer, and this only states it again: give in one or two sentences the reason it holds, opening on the fact itself, never on "That holds": ${quoted(b.excerpt)}.`;
		case "echo":
			return `Start with the content, never by handing his answer back or grading a right one: ${quoted(b.excerpt)}.${/^(?:(?:that|this|it) holds|(?:you|your \w+) (?:were|was) right)\b/i.test(b.excerpt) ? " Open on the fact that makes it hold." : ""}`;
		case "feedback":
			return `A right answer gets no feedback sentence: ${quoted(b.excerpt)}.`;
		case "confidence":
			return `Closing words never tell him how sure he was, which his card already shows, and never restate the break your feedback named: drop ${quoted(b.excerpt)} and keep only the one move that was not obvious.`;
		case "letter":
			return `${b.excerpt.split(" ")[0]} already names another matrix in this session, so he cannot tell which one a step means. Name this matrix with a letter the session has not used yet: ${quoted(b.excerpt.slice(b.excerpt.indexOf(" ") + 1))}.`;
		case "card-words":
			return `His card says each mark in its own words, so you do too, in lowercase inside a sentence: right, partly right or not right; on your own or with help; guessing or confident. Never the record's words (correct, incorrect, partial, sure, guess): ${quoted(b.excerpt)}.`;
		case "reason-twice":
			return `A "Show that…" already asks for his reason, so it takes no ", and why?": ${quoted(b.excerpt)}. End it with a full stop, and pose a part he typed in his words, all of it.`;
		case "maths-words":
			return `Words are prose, never maths type: ${quoted(b.excerpt)} sets a phrase in a formula. Write the sentence as prose with only its maths in $…$ ("$A$ is invertible exactly when $\\det A \\neq 0$").`;
		case "unsaved":
			return `Never tell him an answer is not saved: every answer in the record stays saved, an earlier day's included, and the app itself says when his record can't be read: ${quoted(b.excerpt)}. Leave it out.`;
		case "guess":
			return `${b.excerpt.startsWith("he wrote ") ? `He asked to guess first (${b.excerpt})` : `You invited a guess (${quoted(b.excerpt)})`}, so his answer is a guess before he is told, never a counted attempt: pose it as a prediction, \`type: predict\`, tagged with the step it grows from, so it is kept and never counts. Ask the open question again once his guess is answered.`;
		case "day-part":
			return `A day you name with what it holds is named whole, or by itself alone: ${b.excerpt.replace(/: /, " also holds ")}. Name every item of that day from the close's \`day_items\`, or only the day.`;
		case "card": {
			const [card, said] = [b.excerpt.slice(0, b.excerpt.indexOf("|")), b.excerpt.slice(b.excerpt.indexOf("|") + 1)];
			return `His answer card already says "${card}" above your reply, and your opening says it again: ${quoted(said)}. Open on where it broke, the fact itself, never on the verdict, and never soften it.`;
		}
		case "contrast":
			return `"You …, whereas …" reads as a formula after the break is already said: ${quoted(b.excerpt)}. Leave it out; say one plain sentence of contrast only when it adds something the break did not, never one that opens on what he did.`;
		case "hint-question":
			return `A hint gives him what the question did not, said as a statement: the next move ("Subtract row 1 from row 3 and look at what is left") or a fact the question left out. This one asks him a question instead: ${quoted(b.excerpt)}. Say the move or the fact; his question is asked again after it.`;
		case "not-yet":
			return `Never tell him what he has not done yet: ${quoted(b.excerpt)}. Say what he picks up and when: a half answer he left waits for him at its question, and a topic not started is one he starts, on its day when the plan gives one.`;
		case "hint-back":
			return `A hint gives him a move or a fact he does not have yet, and this one hands his own idea back for him to check: ${quoted(b.excerpt)}. Say the next move past it ("Subtract row 1 and row 2 from row 3, column by column") or the fact it needs, never what his work or your last message already said.`;
		case "credit": {
			const [letter, said] = [b.excerpt.slice(0, b.excerpt.indexOf("|")), b.excerpt.slice(b.excerpt.indexOf("|") + 1)];
			return `${quoted(said)} credits him with work on $${letter}$, which he never worked on in this lesson. Name the matrix he worked on, the one in the question he answered, or say whose work it was.`;
		}
		case "demo-unused":
			return `The demo you called for is now on his screen, and this message never sends him into it: ${quoted(b.excerpt)}. Open on one thing to try in it, by its control ("slide n up and watch the 0 column"), and never read him a value the open question asks.`;
		case "predict":
			return `A prediction asks for his guess, and this question asks him to work something out: ${quoted(b.excerpt)}. ${PREDICT_RULE} So pose it as \`type: check\`, counted; only a question he cannot yet work out is a prediction, and its words then ask for his guess ("What do you expect…").`;
		case "unbuilt":
			return `The demo you called for this turn is still being built, so it is not on his screen: ${quoted(b.excerpt)}. It appears where you called for it once it is built, and a message tells you then. Until that message, say nothing of it and ask nothing that needs it: teach the step in words now, and point him at the demo, and ask what needs it, once it has arrived.`;
		case "due-reviews":
			return `A lesson opens on its first step, and his reviews due today are already on Home: ${quoted(b.excerpt)}. Leave the reviews out and open on the lesson.`;
		case "undisputed":
			return `He disputed no mark, so say nothing of one, nor of how to dispute it: ${quoted(b.excerpt)}. Leave it out; every mark he has not disputed stands as recorded.`;
		case "verdict-words":
			return `His answer's save failed, so his card shows no mark, and this reply never says how his answer was judged: ${quoted(b.excerpt)}. Open on the verdict in words ("Right, …", "Not right: …", "Partly right: …"), then the rest.`;
		case "begun":
			return `This lesson began today, so at its close it continues, never starts: ${quoted(b.excerpt)}. Say it continues on its day ("which you continue tomorrow, Monday 9 November").`;
		case "review-lesson":
			return `This session is his review, whatever it re-teaches, so call it his review, never a lesson: ${quoted(b.excerpt)}.`;
		default:
			return quoted(b.excerpt);
	}
}

type DayItems = Record<string, { day_words: string; items: string[]; lesson: string[] }>;

/** The close result's `day_items` (lesson_progress), or null. */
function dayItemsIn(result: AgentToolResult<unknown>): DayItems | null {
	const text = result.content.find((c): c is { type: "text"; text: string } => c.type === "text")?.text;
	try {
		const parsed = text ? (JSON.parse(text) as { day_items?: unknown }) : null;
		return isRecord(parsed?.day_items) ? (parsed.day_items as DayItems) : null;
	} catch {
		return null;
	}
}

/** The refusal the tutor reads: what broke and how to send it again. The
 *  details keep the refused text for the record. */
function refusal(family: Family, tool: string, text: string, breaks: VoiceBreak[], kind: TurnKind | undefined): AgentToolResult<unknown> {
	const head = family === "message" ? "Not shown to him: this message breaks the voice." : "Not posed: this question breaks the voice.";
	const again =
		family === "message"
			? "Send it again with send_to_user, rewritten to fix only these, and say nothing about the change."
			: `Call ${tool} again with the question rewritten to fix only these, and say nothing about the change.`;
	return {
		content: [{ type: "text", text: [head, ...breaks.map((b) => `- ${fixFor(b, kind, text)}`), again].join("\n") }],
		isError: true,
		details: { withheld: "voice", rules: breaks.map((b) => b.rule), text },
	};
}

/** A message after one of this turn's that ended on a question: the
 *  question is the turn's last word (round 13, 1 n8: "Want to start with
 *  your Independent events review now?", then "The Independent events
 *  review is ready whenever you want to start."). */
const AFTER_ASKING = (text: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: "Not shown to him: your message above ended on a question, and a question is the turn's last word. Send nothing more this turn." }],
	isError: true,
	details: { withheld: "after-asking", text },
});

const DUPLICATE: AgentToolResult<unknown> = {
	content: [{ type: "text", text: "Not shown again: he already has this message from this turn. Send nothing more of it." }],
	isError: true,
	details: { withheld: "duplicate" },
};

/** Words after `probe_done`: the teacher opens the lesson, so the probe
 *  ends with none (its ack says so). */
const AFTER_PROBE = (text: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: "Not shown to him: the probe has ended and the teacher opens the lesson. End your turn with no words." }],
	isError: true,
	details: { withheld: "after-probe", text },
});

/** A question after `probe_done`: its teaching was withheld, so it would
 *  reach him cold, and the teacher asks next (round 7: one was posed, he
 *  missed it, and the miss was saved as a confident error). */
const ASKED_AFTER_PROBE = (text: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: "Not posed: the probe has ended and the teacher opens the lesson. End your turn with no question and no words." }],
	isError: true,
	details: { withheld: "after-probe", text },
});

/** A question kept for the rewrite of the message refused beside it. Not
 *  an error, and it does not end the turn: the rewrite poses it. */
const KEPT = (tool: string): AgentToolResult<null> => ({
	content: [{ type: "text", text: `Kept: he reads this question right under your rewritten message, which poses it. Send the rewrite with send_to_user, and do not call ${tool} again.` }],
	details: null,
	terminate: false,
});

/** Any other turn-ending call beside a refused message: it ran, and the
 *  rewrite ends the turn. */
const WAITS = "It ends your turn once your rewritten message reaches him: send the rewrite with send_to_user, and do not call it again.";

/** A turn-ending call after ordinary text: he never reads that text. */
const PLAIN_OWED = (tool: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: `Not done: he never sees ordinary text, only what you send with send_to_user. If your text before this held anything for him, send it with send_to_user first; then call ${tool} again.` }],
	isError: true,
	details: { withheld: "plain-text" },
});

/** What the tutor reads when its turn would end with nothing shown: the
 *  ordinary text it wrote, or a message refused and never rewritten. */
const PLAIN_TEXT_NOTE = "Not shown to him: he never sees ordinary text, only what you send with send_to_user. Send your reply to him with send_to_user now, with nothing else.";
const OWED_NOTE = "Not shown to him: your message was refused and you sent no rewrite, so he has nothing to read. Send the rewritten message with send_to_user now.";
/** The same, once something after the message was kept or ran: words that
 *  had nothing for him may be dropped (a narrated handoff). */
const OWED_END_NOTE = "Not shown to him: your message was refused and you sent no rewrite. Send the rewritten message with send_to_user now; if nothing in it was for him, end your turn, and what you called after it still reaches him.";
/** A turn after practice handed back that would end with nothing for him
 *  to do (round 7: Explain instead ended on an explanation and no action). */
const NEXT_ACTION_NOTE = "He has nothing to do next. End this turn on one question for him with your question tool, or, once he has answered your check, hand the session back to the problems with practice.";
/** A reply to his work that leaves the problem open with nothing for him
 *  to do (round 8: "It breaks at the line −3x + 2y = 0" and nothing after). */
const NUDGE_NOTE = "His work broke and the problem is still open, but your reply gives him no way on. Send one more message with send_to_user: the smallest nudge toward his next move, as one question or instruction he can act on, never the correction.";
/** A call that would end the turn before his answer this turn was saved
 *  (round 10, 1 m1: a wrong prediction got a rebuttal and the same
 *  question again, and only his right retry was ever saved). */
const UNSAVED = (tool: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: `Not done: his answer to your last question is not saved yet. Save it with course_save first, as it was, a wrong prediction included, since every attempt is kept; then call ${tool} again. If it only asked you something and holds no attempt, call ${tool} again as it is.` }],
	isError: true,
	details: { withheld: "unsaved" },
});
const UNSAVED_NOTE = "His answer to your last question is not saved. Save it with course_save now, as it was, a wrong prediction included, since every attempt is kept; if it only asked you something, it holds no attempt.";

/** The graded question his answer opening this turn replies to, while no
 *  save has kept it yet; null for any other turn. */
function unsavedAnswerOf(messages: readonly LhMessage[]): string | null {
	const input = messages[messages.findLastIndex(opensTurn)];
	if (input?.role !== "toolResult" || input.isError || !GRADED_QUESTION_TOOLS.includes(input.toolName) || !isRealAnswer(input.details)) return null;
	return answeredQuestionsOf(messages).get(input.toolCallId)?.recorded === false ? input.toolCallId : null;
}

/** A question other than the check his first try at missed (Edo, 18 Nov
 *  2026: "yes def want nudge where i try myself again first"; round 15,
 *  2 free: "By 1", confident and wrong, got the whole working at once). */
const RETRY = (question: string): AgentToolResult<unknown> => ({
	content: [
		{
			type: "text",
			text: `Not posed: his first try at your check was not right, so he tries it again before any working, as on a practice problem. Send him with send_to_user where it broke and the smallest nudge toward his next move, as a statement, never the correction; then ask the check again with explain, its question word for word: ${JSON.stringify(question)}. Save his retry with that nudge as its help. Only a second try that is still not right gets the working.`,
		},
	],
	isError: true,
	details: { withheld: "retry" },
});
const RETRY_NOTE = "His first try at your check was not right, and he has not tried it again. Ask the check again with explain, its question word for word, after one nudge toward his next move, never the correction.";

/** The question he set aside to ask something from Ask, when this turn
 *  answers that message: its tool, its words and their key. It is still
 *  open above, so the turn asks it again word for word (round 17, 3 N1:
 *  after "why does RS = I not force SR = I here…" the tutor posed a new
 *  check on the same step, the screen drew it as "Your turn, on the
 *  question above" over the SR question, and his SR answer was filed
 *  under the hidden one). */
function setAsideOf(messages: readonly LhMessage[]): { tool: string; question: string; key: string } | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "user" || m.role === "custom") continue;
		if (m.role !== "toolResult" || !GRADED_QUESTION_TOOLS.includes(m.toolName) || !isRecord(m.details) || m.details.dismissed !== true || m.details.reason !== "asked") return null;
		for (let j = i - 1; j >= 0; j--) {
			const a = messages[j]!;
			if (a.role !== "assistant") continue;
			const call = a.content.find((b): b is ToolCall => b.type === "toolCall" && b.id === m.toolCallId);
			const question = call ? questionText(call) : undefined;
			if (call && question) return { tool: call.name, question, key: sameQuestionKey(question) };
		}
		return null;
	}
	return null;
}

/** His message asks to be taught or told instead of asked: the question
 *  he set aside is set aside for good (ASKED_INSTEAD_TEXT). */
const TAUGHT_INSTEAD = /\b(?:stop (?:quizzing|asking|testing)|no more (?:questions|quizzing)|just (?:explain|tell|teach|show)|teach (?:me|it) instead|explain (?:it )?instead|skip (?:it|this|the question))\b/i;

/** A question other than the one he set aside to ask something. */
const SET_ASIDE = (tool: string, question: string): AgentToolResult<unknown> => ({
	content: [
		{
			type: "text",
			text: `Not posed: he set the open question aside only to ask you something, and it is still open above, as he left it. Answer his message, then ask it again with ${tool}, its question word for word: ${JSON.stringify(question)}. A new question comes after he has answered that one.`,
		},
	],
	isError: true,
	details: { withheld: "set-aside" },
});

/** A question posed straight after an unsure answer, with no words. */
const UNSURE = (why: string): AgentToolResult<unknown> => ({
	content: [
		{
			type: "text",
			text: `Not posed: he was unsure of his answer (${why}), and you gave him no words on it. First send him with send_to_user, in one or two sentences, the reason his answer holds or where it broke, opening on the fact itself, never on a grade ("That holds", "You were right"); then ask this again.`,
		},
	],
	isError: true,
	details: { withheld: "unsure" },
});

/** An option of a choice that stands for several others ("Both: …", "All
 *  of the above"): the question is a choice of several (round 8: the goal
 *  question's "Both" option). */
function joinedOptions(call: Pick<ToolCall, "arguments">): VoiceBreak[] {
	const options = isRecord(call.arguments) && Array.isArray(call.arguments.options) ? call.arguments.options : [];
	return options.flatMap((o) => {
		const label = isRecord(o) && typeof o.label === "string" ? o.label : typeof o === "string" ? o : "";
		return /^(?:both|all of (?:these|them|the above)|all (?:three|four)|any of (?:these|them))\b/i.test(label.trim()) ? [{ rule: "options" as const, excerpt: label }] : [];
	});
}

const MATRIX = /\\begin\{([pbvBV]?matrix)\}[\s\S]*?\\end\{\1\}/g;
const DISPLAY = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g;
const squash = (tex: string) => tex.replace(/\s+/g, "");

/** The matrices and displays of a text, each by a key that ignores
 *  spacing. `displaysOnly` reads the matrices inside displays alone (what
 *  a teaching step shows), else every matrix (a question's inline one too). */
function mathsShown(text: string, displaysOnly: boolean): Array<{ key: string; label: string }> {
	const out: Array<{ key: string; label: string }> = [];
	const displays = [...text.matchAll(DISPLAY)].map((m) => (m[1] ?? m[2] ?? "").trim()).filter(Boolean);
	for (const d of displays) out.push({ key: `d:${squash(d)}`, label: "this display" });
	for (const source of displaysOnly ? displays : [text]) {
		for (const m of source.matchAll(MATRIX)) out.push({ key: `d:${squash(m[0])}`, label: "this matrix" });
	}
	return out;
}

/** One turn's guard, built from the record the turn runs on. `endsTurn`
 *  names the calls that end the turn (a question, a pose, a handoff). */
export class VoiceGuard {
	private readonly input: TurnInput;
	/** A question he was asked before this turn is still open: the turn
	 *  asks it again, drawn above as "Your turn, on the question above". */
	private readonly standing: boolean;
	/** The open question or problem is the last thing he read. */
	private readonly posedLast: boolean;
	private readonly earlier: string[];
	/** The messages he read before this turn, questions aside. */
	private readonly told: string[];
	/** What he worked on this session: his own words, as he wrote them. */
	private readonly his: string[];
	private readonly answeredAt: number;
	private readonly decisions = new Map<string, AgentToolResult<unknown> | null>();
	/** How many times each kind of call was refused this turn. */
	private readonly refused = new Map<Family, number>();
	private readonly said: string[] = [];
	/** The messages shown this turn, questions aside. */
	private readonly toldNow: string[] = [];
	/** A message refused for its length this turn: its words and clauses,
	 *  so a rewrite that has fewer clauses but cut less than the shortest
	 *  of them joined them instead (round 9: ", that" and "because" for a
	 *  colon, nothing cut). A rewrite that splits or trims a sentence keeps
	 *  its clauses and is read by the budget alone (round 10: a one-sentence
	 *  close split in two was refused, as the draft less its only sentence
	 *  left no words at all). */
	private lengthDraft: { words: number; clauses: number; shortest: number } | null = null;
	private readonly asked: string[] = [];
	private concluded = false;
	private sentAtConclude = 0;
	private sent = 0;
	private duplicates = 0;
	private probeEnded = false;
	/** A refused message not yet rewritten, and whether a turn-ending call
	 *  was already held back for it (once a turn). */
	private owed = false;
	private heldForOwed = 0;
	/** The question kept for the owed rewrite: its call, its words, whether
	 *  its tool ran it cleanly, and the reply it was taken out of. */
	private kept: { call: ToolCall; text: string; ran: boolean; from?: { message: AssistantMessage; index: number } } | null = null;
	/** The questions kept this turn, taken out of the replies that asked them. */
	private readonly keptIds = new Set<string>();
	/** The other turn-ending calls beside a refused message, and whether one
	 *  ran: the rewrite ends the turn. */
	private readonly waiting = new Set<string>();
	private waited = false;
	/** The rewrite that poses the kept question, and the one that posed it:
	 *  its result ends the turn, whether it runs before the reply settles or
	 *  after. */
	private releasing: string | null = null;
	private posedUnder: string | null = null;
	private heldUnsure = false;
	/** His answer opening the turn is his first try at a lesson's check,
	 *  and whether this turn saved it as not right: he tries the same
	 *  check again after one nudge, and a different question is held back
	 *  once a turn. */
	private readonly firstTry: { id: string; question: string } | null;
	private retryOwed = false;
	private heldRetry = false;
	/** His answer opening the turn is a later try at a check, with the
	 *  check's right answer, and whether this turn saved it not right: the
	 *  repair then writes the right answer before any next question. */
	private readonly secondTry: { id: string; correct: string; question: string } | null;
	private repairOwed = false;
	private heldRepair = false;
	/** The question he set aside to ask the message this turn answers:
	 *  the turn asks it again before any other, unless his message was
	 *  his answer (a save names it), asked to guess first (a prediction
	 *  goes through) or asked to be taught instead. Held once a turn. */
	private setAside: { tool: string; question: string; key: string } | null;
	private heldSetAside = false;
	/** A save of his answer failed this turn, and no message has said its
	 *  verdict: his card shows no mark while the record can't be read. */
	private verdictOwed = false;
	/** The turn opens a lesson: nothing was said in the session before it. */
	private readonly opening: boolean;
	/** Ordinary text this turn took out of a reply, and whether the turn
	 *  posed a question he can answer, and was already told at its end. */
	private plain = false;
	private posed = false;
	/** This turn saved an answer of his as partly right, or told him one
	 *  was not right: the mark and the words must agree. */
	private savedPartial = false;
	private toldWrong = false;
	/** The results this turn saved for his answers, which his answer
	 *  cards show above the reply. */
	private readonly savedVerdicts = new Set<string>();
	private readonly noted = new Set<string>();
	/** His answer this turn that no save has named yet, in a session with
	 *  a course record to save it to, and whether a turn-ending call was
	 *  held back for it (once a turn). */
	private unsaved: string | null;
	private heldUnsaved = false;
	/** The lesson plan's steps not yet done, each with its title. */
	private readonly stepsAhead: Array<{ id: string; title: string }>;
	/** A demo brief that gave away a step ahead was held back once. */
	private heldDemo = false;
	/** A ruling saved with the record's confidence word was held back once. */
	private heldRuling = false;
	/** This turn called for a demo, which is built after the turn moves on. */
	private building = false;
	/** A message shown this turn ended on a question: it stays the turn's
	 *  last ask. */
	private lastAsked = false;
	/** His messages this turn read mid-reply that no message ending on a
	 *  statement has followed yet: each lets one message answer it, after
	 *  the question too (round 14, 4 major 1: "also, does the ratio test
	 *  need the terms to be positive?" sent while it graded, and its answer
	 *  refused under the grade's nudge question). */
	private unanswered = 0;
	/** The rulings this turn saved, and whether a reply or a save that
	 *  worded one differently was held back (once a turn). */
	private readonly rulings: string[] = [];
	private heldRulingSaid = false;
	/** The close's `day_items`: what each day it names holds. */
	private dayItems: DayItems | null = null;

	constructor(
		messages: readonly LhMessage[],
		private readonly endsTurn: (toolName: string) => boolean = (name) => (QUESTION_TOOLS as readonly string[]).includes(name),
		/** The session is his review (session-opening.ts `reviewRecord`). */
		private readonly review = false,
		/** The session saves his answers to a course record (`course_save`). */
		saves = false,
	) {
		this.input = turnInputOf(messages);
		this.standing = standingQuestion(messages);
		this.firstTry = review ? null : firstTryAtCheck(messages);
		this.secondTry = review ? null : retryAtCheck(messages);
		this.opening = !review && !messages.slice(0, messages.findLastIndex(opensTurn)).some((m) => m.role === "assistant");
		const aside = setAsideOf(messages);
		this.setAside = aside && !(this.input.words && TAUGHT_INSTEAD.test(this.input.words)) ? aside : null;
		this.posedLast = posedLast(messages);
		this.stepsAhead = stepsNotDone(messages);
		this.unsaved = saves ? unsavedAnswerOf(messages) : null;
		const earlier = earlierTexts(messages);
		this.earlier = earlier.map((e) => e.text);
		this.told = earlier.filter((e) => !e.asked).map((e) => e.text);
		this.his = hisWordsOf(messages);
		// The question his answer replies to is the last one he read: a reply
		// works on its matrix, so only what came before it counts as shown.
		this.answeredAt = this.input.answers ? Math.max(0, this.earlier.length - 1) : this.earlier.length;
	}

	/** He sent a message the running turn has now read (a steer). */
	heard(): void {
		this.unanswered++;
	}

	/** Whether a tool's calls pass through the guard: the probe's end too,
	 *  which it reads only once the probe has ended. */
	guards(toolName: string): boolean {
		return toolName === SEND_TO_USER_TOOL || toolName === PROBE_DONE_TOOL || toolName === SAVE_TOOL || toolName === DEMO_TOOL || toolName === LESSON_PROGRESS_TOOL || this.endsTurn(toolName);
	}

	/** Read a call as it finishes streaming. A refused message's text leaves
	 *  the live call, so no view ever draws it. */
	screen(call: ToolCall): void {
		if (call.name === PRACTICE_CONCLUDE_TOOL && !this.concluded) {
			this.concluded = true;
			this.sentAtConclude = this.sent;
			if (savedResults(call.name, call.arguments).includes("partial")) this.savedPartial = true;
		}
		if (call.name === SAVE_TOOL || call.name === PRACTICE_CONCLUDE_TOOL) for (const result of savedResults(call.name, call.arguments)) this.savedVerdicts.add(result);
		const refused = this.decide(call);
		if (refused && call.name === SEND_TO_USER_TOOL) call.arguments = {};
	}

	/** Read ordinary text as its block ends: he never sees it, so it is
	 *  always taken out (true); blank text is left alone. */
	screenText(text: string): boolean {
		if (!text.trim()) return false;
		this.plain = true;
		return true;
	}

	/** What the tutor must read before a turn ends that no tool ended:
	 *  he got nothing to read, though it wrote him something (ordinary
	 *  text, or a refused message never rewritten), or, after practice
	 *  handed the session back, nothing to do. Each once a turn; nothing
	 *  after the probe ends, where the teacher speaks next. */
	beforeEnd(): string | undefined {
		if (this.unsaved && !this.noted.has(UNSAVED_NOTE)) {
			this.noted.add(UNSAVED_NOTE);
			return UNSAVED_NOTE;
		}
		if (this.owed && (this.kept?.ran || this.waited)) {
			if (this.noted.has(OWED_END_NOTE)) return undefined;
			this.noted.add(OWED_END_NOTE);
			return OWED_END_NOTE;
		}
		if (this.probeEnded || this.posed) return undefined;
		const shown = this.sent > 0;
		const leftNoWayOn = this.input.work === true && shown && !this.concluded && !this.owed && !this.said.some(leavesAWayOn);
		if (this.verdictOwed && !this.noted.has(VERDICT_NOTE)) {
			this.noted.add(VERDICT_NOTE);
			return VERDICT_NOTE;
		}
		const unrepaired = this.repairOwed && !writesAnswer(this.secondTry!, this.toldNow);
		const note = !shown && this.owed ? OWED_NOTE : !shown && this.plain ? PLAIN_TEXT_NOTE : this.retryOwed ? RETRY_NOTE : unrepaired ? REPAIRED_NOTE : this.input.handedBack ? NEXT_ACTION_NOTE : leftNoWayOn ? NUDGE_NOTE : undefined;
		if (!note || this.noted.has(note)) return undefined;
		this.noted.add(note);
		return note;
	}

	/** The tool, refusing the calls `screen` refused, and deciding the ones
	 *  it never saw. */
	wrap<T extends AgentTool<any>>(tool: T): T {
		return {
			...tool,
			execute: async (toolCallId, params, signal, onUpdate) => {
				const refused = this.decide({ type: "toolCall", id: toolCallId, name: tool.name, arguments: params as ToolCall["arguments"] });
				if (refused) return refused;
				const partial = tool.name === SAVE_TOOL && savedResults(tool.name, params).includes("partial");
				if (partial && this.toldWrong) return SAVED_AGAINST_WORDS;
				const result = await tool.execute(toolCallId, params, signal, onUpdate);
				if (tool.name === PROBE_DONE_TOOL && !result.isError && isRecord(result.details) && result.details.ok === true) this.probeEnded = true;
				if (tool.name === LESSON_PROGRESS_TOOL && !result.isError) this.dayItems = dayItemsIn(result) ?? this.dayItems;
				if (this.saveFailed(tool.name, params, result)) this.verdictOwed = !this.toldNow.some((t) => VERDICT_SAID.test(t));
				else if (tool.name === SAVE_TOOL && !result.isError && savedObservations(isRecord(params) ? params : {}).length > 0) this.verdictOwed = false;
				if (this.kept?.call.id === toolCallId) {
					if (result.isError) this.letGo();
					else { this.kept.ran = true; return KEPT(tool.name); }
				}
				if (this.waiting.has(toolCallId)) {
					if (result.isError) this.waiting.delete(toolCallId);
					else {
						this.waited = true;
						return { ...result, content: [...result.content, { type: "text", text: WAITS }], terminate: false };
					}
				}
				const poses = (this.releasing === toolCallId && (this.kept?.ran || this.waited)) || this.posedUnder === toolCallId;
				if (poses && !result.isError) return { ...result, terminate: true };
				if (partial && !result.isError) this.savedPartial = true;
				return result;
			},
		};
	}

	private decide(call: ToolCall): AgentToolResult<unknown> | null {
		if (this.decisions.has(call.id)) return this.decisions.get(call.id)!;
		const decision = this.judge(call);
		this.decisions.set(call.id, decision);
		return decision;
	}

	private judge(call: ToolCall): AgentToolResult<unknown> | null {
		// A save read as it streams, before the calls after it: one that
		// names his answer keeps it, so the question after it goes through.
		if (call.name === SAVE_TOOL && this.unsaved && savedQuestionsOf(call.arguments).includes(this.unsaved)) this.unsaved = null;
		if (call.name === SAVE_TOOL && this.firstTry && savedNotRight(call.arguments, this.firstTry.id)) this.retryOwed = true;
		if (call.name === SAVE_TOOL && this.secondTry && savedNotRight(call.arguments, this.secondTry.id)) this.repairOwed = true;
		if (call.name === SAVE_TOOL && this.setAside && savedQuestionsOf(call.arguments).includes(HIS_MESSAGE)) this.setAside = null;
		if (this.unsaved && !this.heldUnsaved && (this.endsTurn(call.name) || call.name === PROBE_DONE_TOOL)) {
			this.heldUnsaved = true;
			return UNSAVED(call.name);
		}
		if (call.name === SEND_TO_USER_TOOL) {
			const text = sendToUserText(call);
			if (!text) return null;
			// A rewrite he is owed goes through, after probe_done too: it is
			// the answer he asked for, never a closing sentence.
			const afterProbe = this.probeEnded && !this.owed;
			if (this.duplicates < 2 && (afterProbe || this.said.some((s) => s.trim() === text.trim()))) {
				this.duplicates++;
				return afterProbe ? AFTER_PROBE(text) : DUPLICATE;
			}
			const answersHim = this.unanswered > 0 && !text.trim().endsWith("?");
			if (this.lastAsked && !this.owed && !answersHim) return AFTER_ASKING(text);
			const ruled = this.rulings.length > 0 && this.sent === 0 && !this.heldRulingSaid && !this.rulings.some((r) => sameRuling(text, r));
			if (ruled) {
				this.heldRulingSaid = true;
				return RULING_SAID(this.rulings[0]!);
			}
			const kind = this.messageKind();
			const breaks = this.held("message", this.messageBreaks(text, kind));
			if (breaks.length > 0) {
				this.refused.set("message", (this.refused.get("message") ?? 0) + 1);
				this.owed = true;
				if (breaks.some((b) => b.rule === "length") && !this.lengthDraft) this.lengthDraft = clausesOf(text);
				return refusal("message", call.name, text, breaks, kind);
			}
			this.owed = false;
			this.lengthDraft = null;
			if (this.kept || this.waiting.size > 0) this.releasing = call.id;
			this.toldNow.push(text);
			if (VERDICT_SAID.test(text)) this.verdictOwed = false;
			if (FLAT_MISS.test(sentences(text)[0]?.trim() ?? "")) this.toldWrong = true;
			this.said.push(text);
			this.asked.push(...sentences(text).filter((s) => s.trim().endsWith("?")));
			if (text.trim().endsWith("?")) this.lastAsked = true;
			else if (this.unanswered > 0) this.unanswered--;
			this.sent++;
			return null;
		}
		if (call.name === DEMO_TOOL) {
			const refused = this.judgeDemo(call);
			if (!refused) this.building = true;
			return refused;
		}
		if (call.name === SAVE_TOOL && this.input.ruling) {
			const rulings = savedRulings(call.arguments);
			const unsaid = this.sent > 0 && !this.heldRulingSaid ? rulings.find((r) => !this.said.some((t) => sameRuling(t, r))) : undefined;
			if (unsaid) {
				this.heldRulingSaid = true;
				return RULING_UNSAID(unsaid);
			}
			const slip = this.heldRuling ? undefined : rulings.map(recordConfidenceWord).find(Boolean);
			if (slip) {
				this.heldRuling = true;
				return RULING_WORDS(slip);
			}
			const capital = this.heldRuling ? undefined : rulings.flatMap((r) => voiceBreaks(r).filter((b) => b.rule === "mark-case")).at(0);
			if (capital) {
				this.heldRuling = true;
				return RULING_CASE(capital.excerpt);
			}
			this.rulings.push(...rulings);
		}
		if (this.probeEnded && (QUESTION_TOOLS as readonly string[]).includes(call.name)) return ASKED_AFTER_PROBE(questionText(call) ?? "");
		// A question beside a refused message is read by its own rules and
		// kept for the rewrite; any other turn-ending call is held once for
		// each refused message (a rewrite may be refused again), or once for
		// ordinary text.
		const question = (QUESTION_TOOLS as readonly string[]).includes(call.name);
		const keeps = this.owed && question;
		if (!this.owed && this.plain && this.sent === 0 && this.heldForOwed < 1 && this.endsTurn(call.name)) {
			this.heldForOwed++;
			return PLAIN_OWED(call.name);
		}
		const waits = this.owed && !question && this.endsTurn(call.name);
		if (call.name === PRACTICE_PROBLEM_TOOL) {
			const refused = this.judgeProblem(call);
			if (!refused && waits) this.waiting.add(call.id);
			return refused;
		}
		if (waits) this.waiting.add(call.id);
		if (!question) return null;
		const text = questionText(call);
		if (!text) return null;
		if (this.input.unsure && this.sent === 0 && !this.owed && !this.heldUnsure) {
			this.heldUnsure = true;
			return UNSURE(this.input.unsure);
		}
		const asksAside = !!this.setAside && GRADED_QUESTION_TOOLS.includes(call.name) && sameQuestionKey(text) === this.setAside.key;
		const guessFirst = !!this.input.guess && normalizeQuestionType(isRecord(call.arguments) ? call.arguments.type : undefined) === "predict";
		if (this.setAside && GRADED_QUESTION_TOOLS.includes(call.name) && !asksAside && !guessFirst && !this.heldSetAside) {
			this.heldSetAside = true;
			return SET_ASIDE(this.setAside.tool, this.setAside.question);
		}
		if (asksAside) this.setAside = null;
		if (this.repairOwed && !this.heldRepair && !writesAnswer(this.secondTry!, this.toldNow)) {
			this.heldRepair = true;
			return REPAIRED(this.secondTry!.correct);
		}
		if (this.retryOwed && !this.heldRetry && !(call.name === "explain" && sameQuestionKey(text) === this.firstTry?.question)) {
			this.heldRetry = true;
			return RETRY(this.firstTry!.question);
		}
		const breaks = this.held("question", [...this.questionBreaks(text), ...joinedOptions(call), ...this.guessAsked(call, text), ...this.predictUnworded(call, text)]);
		if (breaks.length > 0) {
			this.refused.set("question", (this.refused.get("question") ?? 0) + 1);
			return refusal("question", call.name, text, breaks, undefined);
		}
		if (keeps && parseQuestionInput(call.name, call.arguments)) {
			this.letGo();
			this.kept = { call, text, ran: false };
			this.keptIds.add(call.id);
			return null;
		}
		// A question posed anew lets go of the one kept.
		this.letGo();
		this.said.push(text);
		this.posed = true;
		return null;
	}

	/** Read a reply as it ends, before the record keeps it or a view draws
	 *  it: a question kept in it leaves it, and the reply whose rewrite
	 *  passed, asking no question of its own, poses the kept one under it. */
	settle(message: AssistantMessage): void {
		if (this.kept?.from && this.kept.from.message !== message && !this.kept.ran) this.letGo();
		for (let i = message.content.length - 1; i >= 0; i--) {
			const block = message.content[i]!;
			if (block.type !== "toolCall" || !this.keptIds.has(block.id)) continue;
			message.content.splice(i, 1);
			if (this.kept?.call.id === block.id) this.kept = { ...this.kept, call: block, from: { message, index: i } };
		}
		const kept = this.kept;
		const rewrite = this.releasing !== null && message.content.some((b) => b.type === "toolCall" && b.id === this.releasing);
		// The turn ends on a reply that calls nothing, after the note that let
		// words with nothing for him go: the kept question is its last word.
		const ending = this.noted.has(OWED_END_NOTE) && !message.content.some((b) => b.type === "toolCall");
		const asks = message.content.some((b) => b.type === "toolCall" && (QUESTION_TOOLS as readonly string[]).includes(b.name) && this.decisions.get(b.id) === null);
		if (!kept?.ran || !(rewrite || ending) || asks) return;
		message.content.push(kept.call);
		this.said.push(kept.text);
		this.posed = true;
		this.posedUnder = this.releasing;
		this.kept = null;
		this.releasing = null;
	}

	/** A save of his answer that did not go through: a `course_save` of
	 *  his attempts refused, or a problem's conclude whose attempts were
	 *  kept unsaved (the record could not be read). */
	private saveFailed(name: string, params: unknown, result: AgentToolResult<unknown>): boolean {
		if (name === PRACTICE_CONCLUDE_TOOL) return isRecord(result.details) && Array.isArray(result.details.unsaved) && result.details.unsaved.length > 0;
		return name === SAVE_TOOL && result.isError === true && savedObservations(isRecord(params) ? params : {}).some((o) => typeof o.result === "string");
	}

	/** Lets go of the kept question. One whose tool refused it goes back
	 *  where it was asked, beside its refusal; one never posed is only gone
	 *  (its clean result is the question's placeholder, never a record fact). */
	private letGo(): void {
		const kept = this.kept;
		this.kept = null;
		this.releasing = null;
		if (kept?.from && !kept.ran) kept.from.message.content.splice(kept.from.index, 0, kept.call);
	}

	/** A posed problem's statement holds no advice and no instruction to
 *  defend the answer under its question (round 9: "What is dim span{u, v,
 *  w}? Justify your answer."); its parts are its own asks. */
	private judgeProblem(call: ToolCall): AgentToolResult<unknown> | null {
		const statement = isRecord(call.arguments) && typeof call.arguments.statement === "string" ? call.arguments.statement : "";
		const advice = problemAdvice(statement);
		const breaks = this.held("question", advice.length > 0 ? [{ rule: "advice", excerpt: advice.join(" ") }] : []);
		if (breaks.length === 0) return null;
		this.refused.set("question", (this.refused.get("question") ?? 0) + 1);
		return refusal("question", call.name, statement, breaks, undefined);
	}

	/** The breaks a call is refused for: all of them for the draft and its
	 *  first rewrite, then only the hard rules, so a rewrite that still
	 *  slips elsewhere is shown rather than looped. */
	private held(family: Family, breaks: VoiceBreak[]): VoiceBreak[] {
		return (this.refused.get(family) ?? 0) >= 2 ? breaks.filter((b) => HARD.has(b.rule)) : breaks;
	}

	/** The kind of turn this message is: the input's for the turn's first
	 *  message, closing words for the first after a concluded problem, a
	 *  teaching step for any later one. */
	private messageKind(): TurnKind | undefined {
		if (this.concluded) return "close";
		if (this.sent === 0 || this.input.kind === "close") return this.input.kind;
		return "teach";
	}

	private messageBreaks(text: string, kind: TurnKind | undefined): VoiceBreak[] {
		// The plan's days are the answer to his question about the plan, and
		// a close names the day he picks up on (round 10: "Its review is
		// planned for tomorrow" refused in a close).
		const asksPlan = kind === "direct" && PLAN_QUESTION.test(this.input.words ?? "");
		const out = voiceBreaks(text, kind).filter((b) => !(b.rule === "plan" && (asksPlan || (kind === "close" && PLANNED_DAY.test(b.excerpt)))));
		if (!out.some((b) => b.rule === "questions")) {
			const asked = [...this.asked, ...sentences(text).filter((s) => s.trim().endsWith("?"))];
			if (asked.length > 1) out.push({ rule: "questions", excerpt: asked.join(" ") });
		}
		const first = sentences(text)[0]?.trim() ?? "";
		if (this.savedPartial && FLAT_MISS.test(first)) out.push({ rule: "verdict", excerpt: first });
		const restated = [...this.savedVerdicts].map((result) => RESTATED_VERDICT[result]).find((v) => v?.re.test(first));
		if (restated) out.push({ rule: "card", excerpt: `${restated.card}|${first}` });
		const compound = compoundAsk(sentences(text).filter((s) => s.trim().endsWith("?")).join(" "));
		if (compound) out.push(compound);
		const under = afterQuestion(text);
		if (under.length > 0 && kind !== "hint") out.push({ rule: "advice", excerpt: under.join(" ") });
		// A hint gives what the question did not; asked as a question, it
		// asked the same thing again (round 14, m17: "What does R3 − R1 − R2
		// give you?" became "What happens to row 3 during elimination if it
		// really is row 1 plus row 2?"), on a practice problem as on a check
		// (round 15, m16).
		const hintAsks = kind === "hint" || this.input.hint ? sentences(text).find((s) => s.trim().endsWith("?")) : undefined;
		if (hintAsks) out.push({ rule: "hint-question", excerpt: hintAsks.trim() });
		const handsBack = kind === "hint" || this.input.hint ? pointsBack(text) : null;
		if (handsBack) out.push({ rule: "hint-back", excerpt: handsBack });
		const replying = this.input.answers && (this.sent === 0 || (this.concluded && this.sent === this.sentAtConclude));
		const echo = replying ? echoOf(text, this.input.words) : null;
		if (echo) out.push({ rule: "echo", excerpt: echo });
		const unsureEcho = replying && this.input.unsure ? restatesWithoutReason(text) : null;
		if (unsureEcho && !echo) out.push({ rule: "reason", excerpt: unsureEcho });
		const moral = kind === "direct" ? closingMoral(text) : null;
		if (moral) out.push({ rule: "moral", excerpt: moral });
		// A mark named anywhere is said in his card's words (round 16, m14).
		const recordWord = recordMarkWords(text);
		if (recordWord) out.push({ rule: "card-words", excerpt: recordWord });
		const sure = kind === "close" ? narratedConfidence(text) : null;
		if (sure) out.push({ rule: "confidence", excerpt: sure });
		const part = this.dayItems ? partialDay(text, this.dayItems) : null;
		if (part) out.push({ rule: "day-part", excerpt: part });
		if (this.owed && this.lengthDraft && !out.some((b) => b.rule === "length")) {
			const { words, clauses } = clausesOf(text);
			const draft = this.lengthDraft;
			if (clauses < draft.clauses && words > draft.words - draft.shortest) out.push({ rule: "length", excerpt: `joined: ${words} words where the draft had ${draft.words}, in fewer sentences` });
		}
		const answered = this.input.answers ? this.earlier[this.answeredAt] : undefined;
		const credited = creditedLetter(text, [...this.his, ...(answered ? [answered] : [])]);
		if (credited) out.push({ rule: "credit", excerpt: `${credited.letter}|${credited.said}` });
		if (this.input.demo && this.sent === 0 && !POINTS_AT_DEMO.test(text)) out.push({ rule: "demo-unused", excerpt: first });
		const below = this.standing ? questionBelow(text) : null;
		if (below) out.push({ rule: "below", excerpt: below });
		const pointer = this.posedLast && this.sent === 0 ? sentences(text).map((s) => s.trim()).find((s) => /\b(?:still )?open above\b|\babove,? (?:still )?open\b|\bis (?:still )?(?:waiting|there) above\b/i.test(s)) : undefined;
		if (pointer) out.push({ rule: "pointer", excerpt: pointer });
		// A lesson's opening teaches: the reviews due today are Home's to
		// offer (round 17, m15: every new lesson, a Linear Algebra one
		// included, opened by listing four due Probability reviews).
		const markTalk = !this.input.ruling && !HIS_MARK_WORDS.test(this.input.words ?? "") ? sentences(text).find((s) => MARK_TALK.test(s)) : undefined;
		if (markTalk) out.push({ rule: "undisputed", excerpt: markTalk.trim() });
		if (this.verdictOwed && !VERDICT_SAID.test(text)) out.push({ rule: "verdict-words", excerpt: first });
		const startsBegun = kind === "close" && !this.review && this.earlier.length > this.told.length ? sentences(text).find((s) => STARTS_IT.test(s)) : undefined;
		if (startsBegun) out.push({ rule: "begun", excerpt: startsBegun.trim() });
		const dueSaid = this.opening && kind !== "close" && !asksPlan ? DUE_REVIEWS.exec(text) : null;
		if (dueSaid) out.push({ rule: "due-reviews", excerpt: sentences(text).find((s) => DUE_REVIEWS.test(s))?.trim() ?? dueSaid[0] });
		const asLesson = this.review ? SESSION_AS_LESSON.exec(text) : null;
		if (asLesson) out.push({ rule: "review-lesson", excerpt: asLesson[0] });
		const shownBefore = kind === "teach" ? this.shownBefore(text) : null;
		if (shownBefore) out.push({ rule: "repeat", excerpt: `display ${shownBefore}` });
		const boxed = restatingCallout(text);
		if (boxed) out.push({ rule: "repeat", excerpt: `callout ${quoted(boxed.said)}, said above as ${quoted(boxed.before)}` });
		return [...out, ...this.letters(text), ...this.repeats(text, true), ...this.unbuilt(text)];
	}

	/** Words that point at a demo this turn called for: it is built after
	 *  the turn moves on, so he would read of a demo that is not there
	 *  (round 13, 3 N1: "In the demo, slide d until the columns line up"
	 *  with no demo on screen, and a question that needed it). */
	private unbuilt(text: string): VoiceBreak[] {
		if (!this.building) return [];
		const said = sentences(text).find((s) => DEMO_WORD.test(s));
		return said ? [{ rule: "unbuilt", excerpt: said.trim() }] : [];
	}

	private questionBreaks(text: string): VoiceBreak[] {
		const out = voiceBreaks(text).filter((b) => b.rule !== "headings");
		// A part he typed is the sheet's own and is posed in his words, all
		// of it, whatever it asks (round 12, 2 n5).
		const compound = compoundAsk(text);
		if (compound && !asksAreHis(text, this.input.words)) out.push(compound);
		const twice = reasonAskedTwice(text);
		if (twice) out.push({ rule: "reason-twice", excerpt: twice });
		const advice = [...new Set([...afterQuestion(text), ...adviceSentences(text)])];
		if (advice.length > 0) out.push({ rule: "advice", excerpt: advice.join(" ") });
		return [...out, ...this.letters(text), ...this.repeats(text), ...this.unbuilt(text)];
	}

	/** A demo brief that prints the formula a step not yet done is about:
	 *  the demo would hand him what the lesson is about to ask (round 12,
	 *  3 D1: the Poisson demo printed (1 − λ/n)^n beside e^{−λ} before the
	 *  limit was taught). Held back once a turn. */
	private judgeDemo(call: ToolCall): AgentToolResult<unknown> | null {
		if (this.heldDemo) return null;
		const brief = isRecord(call.arguments) ? [call.arguments.title, call.arguments.brief].filter((v) => typeof v === "string").join("\n") : "";
		const said = formulaKey(brief);
		const ahead = this.stepsAhead.find((step) => formulasOf(step.title).some((f) => f.length >= 5 && said.includes(f)));
		if (!ahead) return null;
		this.heldDemo = true;
		return DEMO_GIVES_AWAY(ahead.title);
	}

	/** A lesson question posed after he asked to guess first, or under the
	 *  tutor's own invitation to guess, that is not a prediction: his guess
	 *  would count as an attempt (round 12, 2 M1: "Go ahead, guess." and a
	 *  check, and his guess became the topic's open mistake). */
	private guessAsked(call: ToolCall, text: string): VoiceBreak[] {
		if (call.name !== "explain" || normalizeQuestionType(isRecord(call.arguments) ? call.arguments.type : undefined) === "predict") return [];
		if (this.input.guess) return [{ rule: "guess", excerpt: `he wrote "${this.input.guess}"` }];
		const invited = [...this.toldNow, text].map((t) => GUESS_INVITE.exec(t)?.[0]).find(Boolean);
		return invited ? [{ rule: "guess", excerpt: invited }] : [];
	}

	/** A lesson question typed a prediction whose words never ask for his
	 *  guess: his box says "Your prediction, and why", and his worked answer
	 *  would be kept as "Prediction, not counted" (round 14, M3: "For the
	 *  hour to average 3 calls whatever n we pick, what should p be, and
	 *  why?" and "If you tried to build a map that undoes C, what would go
	 *  wrong?" were predictions, and his derivations never counted). A guess
	 *  invited in this turn's message is asked for. */
	private predictUnworded(call: ToolCall, text: string): VoiceBreak[] {
		if (call.name !== "explain" || normalizeQuestionType(isRecord(call.arguments) ? call.arguments.type : undefined) !== "predict") return [];
		if ([...this.toldNow, text].some((t) => ASKS_A_GUESS.test(t) || GUESS_INVITE.test(t)) || this.input.guess) return [];
		return [{ rule: "predict", excerpt: text }];
	}

	/** A matrix named with a letter an earlier one of the session has. */
	private letters(text: string): VoiceBreak[] {
		const reused = reusedLetter(text, [...this.earlier, ...this.said]);
		return reused ? [{ rule: "letter", excerpt: `${reused.letter} ${reused.written}` }] : [];
	}

	/** A matrix or display of a teaching step that he already read earlier
	 *  in the session, outside the question this turn answers: the step says
	 *  again what he was shown (round 8: the first teaching step re-taught
	 *  the probe's feedback on the same matrix). */
	private shownBefore(text: string): string | null {
		const mine = mathsShown(text, true);
		if (mine.length === 0) return null;
		const before = this.earlier.slice(0, this.answeredAt);
		const seen = new Set(before.flatMap((t) => mathsShown(t, false).map((m) => m.key)));
		const hit = mine.find((m) => seen.has(m.key));
		return hit ? hit.label : null;
	}

	/** Advice said earlier in the session, and for a message, a point it
 *  made earlier (round 9: one lesson said four times that pairs miss a
 *  combination of two others). A question may name what a message said. */
	private repeats(text: string, message = false): VoiceBreak[] {
		const repeat = repeatedAdvice(text, [...this.earlier, ...this.said]);
		if (repeat) return [{ rule: "repeat", excerpt: `${quoted(repeat.said)}, said before as ${quoted(repeat.before)}` }];
		// A close names what he picks up and its day, as its rule says, each
		// time he closes; a ruling is news (round 10: both refused as repeats).
		const pointsHeld = message && this.input.kind !== "close" && !this.input.ruling;
		const point = pointsHeld ? repeatedPoint(text, [...this.told, ...this.toldNow]) : null;
		return point ? [{ rule: "repeat", excerpt: `point ${quoted(point.said)}, said before as ${quoted(point.before)}` }] : [];
	}
}
