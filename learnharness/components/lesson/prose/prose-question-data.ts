/**
 * The Prose lesson's reading of an open question (spec: prose.md): what it
 * asks for, in what form, and the answer his words and picks make. Pure, so
 * the inline question, the composer and the tests read one truth.
 */

import type { LeftOpen } from "@/components/lesson/stranded-draft";
import {
	buildAnswer,
	normalizeOptions,
	normalizeQuestionType,
	parseQuestionInput,
	QUESTION_TOOLS,
	sameQuestionKey,
	toolQuestionKind,
	type AskToolInput,
	type Confidence,
	type DockSelection,
	type ExplainToolInput,
	type QuestionAnswerData,
	type QuestionData,
	type QuestionMode,
} from "@/src/core";

/** A question as the Prose lesson draws and answers it. */
export interface ProseQuestionSpec {
	tool: string;
	kind: "ask" | "explain";
	/** Text questions take his words; choice questions take a pick. */
	mode: QuestionMode;
	data: QuestionData;
	/** An ask with choices also takes his own answer when nothing is picked. */
	takesOwnAnswer: boolean;
	/** He can give it up with Show me: a check, never a prediction, which
	 *  asks before anything is taught. */
	showsAnswer: boolean;
}

/** The question a tool call asks, or null when its input doesn't parse. */
export function proseQuestionSpec(tool: string, toolCallId: string, input: unknown): ProseQuestionSpec | null {
	const parsed = parseQuestionInput(tool, input);
	if (!parsed) return null;
	const kind = toolQuestionKind(tool);
	const ask = kind === "ask" ? (parsed as AskToolInput) : null;
	const explain = kind === "explain" ? (parsed as ExplainToolInput) : null;
	const options = normalizeOptions((ask?.options ?? []) as { label: string; value?: string; description?: string }[]);
	const mode: QuestionMode = options.length ? (ask?.multiSelect ? "multi-select" : "single-select") : "text";
	const data: QuestionData = {
		id: toolCallId,
		kind,
		question: parsed.question,
		mode,
		options,
		createdAt: new Date().toISOString(),
		...(explain ? { committedAnswer: explain.correctAnswer } : {}),
	};
	const predicts = normalizeQuestionType((input as { type?: unknown } | null)?.type) === "predict";
	return { tool, kind, mode, data, takesOwnAnswer: kind === "ask" && mode !== "text", showsAnswer: kind === "explain" && !predicts };
}

/** What the field says it wants while the question is open: literal words,
 *  by what the question asks. */
export function prosePlaceholder(spec: ProseQuestionSpec, input: unknown, picked: boolean): string {
	if (spec.mode !== "text") {
		if (picked) return "Anything to add?";
		const many = spec.mode === "multi-select";
		return spec.takesOwnAnswer ? (many ? "Pick any above, or write your own answer" : "Pick one above, or write your own answer") : many ? "Pick any above" : "Pick one above";
	}
	if (spec.kind === "explain" && normalizeQuestionType((input as { type?: unknown } | null)?.type) === "predict") return "Your prediction, and why";
	return "Your answer";
}

/** Whether there is an answer to send: a pick, or his own words where they
 *  answer (a text question, or an ask's own answer), or a photo of his working. */
export function proseAnswerReady(spec: ProseQuestionSpec, selection: DockSelection, text: string, photos: number): boolean {
	if (spec.mode === "text") return text.trim().length > 0 || photos > 0;
	return selection.selected.size > 0 || (spec.takesOwnAnswer && text.trim().length > 0);
}

/** The answer his field and picks make. The field is his answer on a text
 *  question; on a choice it is his own answer when nothing is picked (an
 *  ask), else what he adds to the pick. */
export function proseAnswer(spec: ProseQuestionSpec, selection: DockSelection, text: string, confidence: Confidence): QuestionAnswerData {
	const words = text.trim();
	const picked = selection.selected.size > 0;
	return buildAnswer(
		spec.data,
		{
			values: [...selection.selected].map((i) => spec.data.options[i]!.value),
			text: spec.mode === "text" ? words : undefined,
			other: spec.mode !== "text" && !picked && spec.takesOwnAnswer ? words : undefined,
			thinking: spec.mode !== "text" && picked ? words || undefined : undefined,
			confidence: spec.kind === "explain" ? confidence : undefined,
		},
		spec.tool,
	);
}

/** Hint on a check: a request carrying his words so far, never an answer. */
export function proseHintRequest(spec: ProseQuestionSpec, text: string): QuestionAnswerData {
	const words = text.trim() || undefined;
	return buildAnswer(spec.data, { text: spec.mode === "text" ? words : undefined, thinking: spec.mode !== "text" ? words : undefined, hint: true }, spec.tool);
}

/** Show me on a check: he gives up, with his words so far as his work. */
export function proseShowMeRequest(spec: ProseQuestionSpec, text: string): QuestionAnswerData {
	const words = text.trim() || undefined;
	return buildAnswer(spec.data, { text: spec.mode === "text" ? words : undefined, thinking: spec.mode !== "text" ? words : undefined, showMe: true }, spec.tool);
}

/** The digit key's option: 1 to 9 pick the options in order. */
export function digitOption(key: string, optionCount: number): number | null {
	if (!/^[1-9]$/.test(key)) return null;
	const index = Number(key) - 1;
	return index < optionCount ? index : null;
}

/** A transcript part as the re-ask reading needs it. */
interface QuestionPart {
	type: string;
	toolCallId?: string;
	state?: string;
	input?: unknown;
	output?: unknown;
}

/** A question call he was asked: a question tool's part that the guard
 *  did not refuse (a refused call never showed, so the re-ask after it is
 *  the one that asks again; round 8: the refused call took the mark and
 *  the real re-ask printed in full). */
function asked(part: QuestionPart): boolean {
	return part.type.startsWith("tool-") && (QUESTION_TOOLS as readonly string[]).includes(part.type.slice("tool-".length)) && part.state !== "output-error";
}

/** Why a question's answer left it still open: he pressed Hint on it, or
 *  set it aside to ask the tutor something. null for an answer or a skip. */
export function leftOpen(output: unknown): LeftOpen | null {
	const left = output as Partial<QuestionAnswerData> | undefined;
	if (left?.hintRequested === true) return "hint";
	if (left?.dismissed === true && left.reason === "asked") return "asked";
	return null;
}

/** The question call `toolCallId` asks again, in whatever words: the
 *  question just before it, when that one was left open (round 7: the
 *  re-ask after a hint dropped "Say why." and lost his carried work). */
export function reaskedFrom(messages: ReadonlyArray<{ parts: readonly QuestionPart[] }>, toolCallId: string): string | null {
	let previous: QuestionPart | null = null;
	const lastOfKind = new Map<string, QuestionPart>();
	for (const message of messages) {
		for (const part of message.parts) {
			if (!asked(part)) continue;
			if (part.toolCallId === toolCallId) {
				if (previous?.toolCallId && leftOpen(previous.output)) return asksAgain(previous, part) ? previous.toolCallId : null;
				const same = lastOfKind.get(questionKindOf(part));
				return same?.toolCallId && leftForToday(same.output) && asksAgain(same, part) ? same.toolCallId : null;
			}
			previous = part;
			lastOfKind.set(questionKindOf(part), part);
		}
	}
	return null;
}

/** A question's kind as a re-ask keeps it: its tool and its form (his
 *  words, one pick or several). */
function questionKindOf(part: QuestionPart): string {
	const input = part.input as { options?: unknown; multiSelect?: unknown } | undefined;
	const form = Array.isArray(input?.options) && input.options.length > 0 ? (input.multiSelect === true ? "multi" : "single") : "text";
	return `${part.type}:${form}`;
}

/** Done for today set the question aside unanswered (round 8: the tutor
 *  asked it again in other words, and the half answer kept for it never
 *  came back). The next question of its kind asks it again, unless the two
 *  name different plan steps. */
function leftForToday(output: unknown): boolean {
	const left = output as Partial<QuestionAnswerData> | undefined;
	return left?.dismissed === true && left.reason === "tonight";
}

/** Whether `next` asks `left` again, in whatever words: the same kind of
 *  question on the same plan step, of the same type unless its words are
 *  the same. A question of another form, step or type after a hint or a
 *  side question is a new one, and draws its words (round 14, 2 D1: a
 *  prediction posed on the step of the check he set aside to guess first
 *  showed only "Your turn, on the question above"). */
function asksAgain(left: QuestionPart, next: QuestionPart): boolean {
	return questionKindOf(left) === questionKindOf(next) && sameStep(left, next) && (sameType(left, next) || sameQuestionWords(left, next));
}

function sameType(a: QuestionPart, b: QuestionPart): boolean {
	const type = (part: QuestionPart) => normalizeQuestionType((part.input as { type?: unknown } | undefined)?.type) ?? "check";
	return type(a) === type(b);
}

function sameQuestionWords(a: QuestionPart, b: QuestionPart): boolean {
	const words = (part: QuestionPart) => (part.input as { question?: unknown } | undefined)?.question;
	const x = words(a);
	const y = words(b);
	return typeof x === "string" && typeof y === "string" && sameQuestionKey(x) === sameQuestionKey(y);
}

/** Whether `next` asks again, in the same words, a question he answered:
 *  his first try at a lesson's check was not right, and after one nudge he
 *  tries it again (Edo, 18 Nov 2026), or he answered with a question of
 *  his own, sent in Answer mode by mistake, and the tutor answered it.
 *  Its words are on screen above already (round 10, 2 m7: printed in full
 *  a second time). A new question after his answer is drawn in full. */
function sameWords(left: QuestionPart, next: QuestionPart): boolean {
	const answer = left.output as Partial<QuestionAnswerData> | undefined;
	if (!answer || answer.dismissed === true || answer.hintRequested === true) return false;
	return questionKindOf(left) === questionKindOf(next) && sameQuestionWords(left, next);
}

function sameStep(a: QuestionPart, b: QuestionPart): boolean {
	const step = (part: QuestionPart) => (part.input as { nodeId?: unknown } | undefined)?.nodeId;
	const x = step(a);
	const y = step(b);
	return typeof x !== "string" || typeof y !== "string" || x === y;
}

/** How the question call `toolCallId` left, when it is still open. */
export function leftOpenOf(messages: ReadonlyArray<{ parts: readonly QuestionPart[] }>, toolCallId: string): LeftOpen | null {
	for (const message of messages) {
		for (const part of message.parts) if (part.toolCallId === toolCallId) return leftOpen(part.output);
	}
	return null;
}

/** The question calls that ask again the question he just pressed Hint on
 *  or set aside to ask the tutor something, in whatever words (the same
 *  identity `reaskedFrom` and the carry read). The tutor asks it again after
 *  either (neither is an answer, so the question must come back open), and
 *  the transcript draws its words once, above the hint or his side
 *  question, so the re-ask draws only the mark that it is his turn again
 *  (round 5: the whole question printed twice after a hint; round 6: after
 *  a side question; round 8: twice again whenever the re-ask was reworded).
 *  So is one asked again word for word after he sent a question as his
 *  answer (`sameWords`). */
export function askedAgain(messages: ReadonlyArray<{ parts: readonly QuestionPart[] }>): ReadonlySet<string> {
	return new Set(reasks(messages).map((r) => r.id));
}

/** The questions Done for today set aside that are asked again further
 *  down (the app's re-pose when he opens the session, or an older
 *  record's re-ask under the close): the next question of its kind asks it
 *  again (`asksAgain`). Its words are drawn once, where he answers it, and
 *  the set-aside one keeps only "Left for next time" (round 14, M1 and the
 *  cross-surface check: opened again, the page drew the left question
 *  twice). */
export function leftAskedBelow(messages: ReadonlyArray<{ parts: readonly QuestionPart[] }>): ReadonlySet<string> {
	const out = new Set<string>();
	const waiting = new Map<string, QuestionPart>();
	for (const message of messages) {
		for (const part of message.parts) {
			if (!asked(part)) continue;
			const kind = questionKindOf(part);
			const left = waiting.get(kind);
			if (left?.toolCallId && asksAgain(left, part)) out.add(left.toolCallId);
			waiting.delete(kind);
			if (part.toolCallId && leftForToday(part.output)) waiting.set(kind, part);
		}
	}
	return out;
}

/** The re-asks (`askedAgain`) that follow a hint: the hint may itself end
 *  in a question, so their mark names the question he pressed Hint on,
 *  never "the question above" (round 12, 3 D11). */
export function askedAfterHint(messages: ReadonlyArray<{ parts: readonly QuestionPart[] }>): ReadonlySet<string> {
	return new Set(reasks(messages).filter((r) => r.after === "hint").map((r) => r.id));
}

function reasks(messages: ReadonlyArray<{ parts: readonly QuestionPart[] }>): Array<{ id: string; after: LeftOpen | null }> {
	const out: Array<{ id: string; after: LeftOpen | null }> = [];
	let previous: QuestionPart | null = null;
	for (const message of messages) {
		for (const part of message.parts) {
			if (!asked(part)) continue;
			const left = previous ? leftOpen(previous.output) : null;
			if (previous && part.toolCallId && ((left !== null && asksAgain(previous, part)) || sameWords(previous, part))) out.push({ id: part.toolCallId, after: left });
			previous = part;
		}
	}
	return out;
}
