/**
 * The Prose lesson's reading of an open question (spec: prose.md): what it
 * asks for, in what form, and the answer his words and picks make. Pure, so
 * the inline question, the composer and the tests read one truth.
 */

import {
	buildAnswer,
	normalizeOptions,
	normalizeQuestionType,
	parseQuestionInput,
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
