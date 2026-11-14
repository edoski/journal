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
	return { tool, kind, mode, data, takesOwnAnswer: kind === "ask" && mode !== "text" };
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
	input?: unknown;
	output?: unknown;
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
	for (const message of messages) {
		for (const part of message.parts) {
			if (!part.type.startsWith("tool-") || !(QUESTION_TOOLS as readonly string[]).includes(part.type.slice("tool-".length))) continue;
			if (part.toolCallId === toolCallId) return previous?.toolCallId && leftOpen(previous.output) ? previous.toolCallId : null;
			previous = part;
		}
	}
	return null;
}

/** How the question call `toolCallId` left, when it is still open. */
export function leftOpenOf(messages: ReadonlyArray<{ parts: readonly QuestionPart[] }>, toolCallId: string): LeftOpen | null {
	for (const message of messages) {
		for (const part of message.parts) if (part.toolCallId === toolCallId) return leftOpen(part.output);
	}
	return null;
}

/** The question calls that ask again, word for word, the question he just
 *  pressed Hint on or set aside to ask the tutor something. The tutor asks
 *  it again after either (neither is an answer, so the question must come
 *  back open), and the transcript draws those words once, above the hint or
 *  his side question, so the re-ask draws nothing of its own (round 5: the
 *  whole question printed twice after a hint; round 6: after a side
 *  question). A re-ask in new words is a rephrasing and draws them. */
export function askedAgain(messages: ReadonlyArray<{ parts: readonly QuestionPart[] }>): ReadonlySet<string> {
	const reasked = new Set<string>();
	const words = (part: QuestionPart) => {
		const question = (part.input as { question?: unknown } | undefined)?.question;
		return typeof question === "string" ? question.replace(/\s+/g, " ").trim() : null;
	};
	let previous: QuestionPart | null = null;
	for (const message of messages) {
		for (const part of message.parts) {
			if (!part.type.startsWith("tool-") || !(QUESTION_TOOLS as readonly string[]).includes(part.type.slice("tool-".length))) continue;
			const open = leftOpen(previous?.output) !== null;
			if (previous && open && part.toolCallId && words(part) !== null && words(part) === words(previous)) reasked.add(part.toolCallId);
			previous = part;
		}
	}
	return reasked;
}
