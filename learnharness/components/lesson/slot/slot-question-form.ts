"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	buildAnswer,
	DEFAULT_CONFIDENCE,
	emptyDockSelection,
	normalizeOptions,
	toggleOption,
	toggleOther,
	toolQuestionKind,
	type AnswerRequest,
	type AskToolInput,
	type Confidence,
	type DockSelection,
	type ExplainToolInput,
	type Photo,
	type QuestionAnswerData,
	type QuestionData,
	type QuestionFormDraft,
	type QuestionMode,
	type SelectMode,
} from "@/src/core";
import { sentPhotos, usePhotoDraft } from "@/components/photos";
import { carriedForm, formToKept, keepPhotos, keepWords, keptToForm, keptWords, takeKeptPhotos } from "@/components/lesson/kept-drafts";
import { formDraftText } from "@/components/lesson/stranded-draft";

export interface SlotQuestionFormOptions {
	toolName: string;
	toolCallId: string;
	input: AskToolInput | ExplainToolInput;
	/** The answer, with any photos of his working (text answers only). */
	onSubmit: (output: QuestionAnswerData, photos?: Photo[]) => void;
	/** This call's unconfirmed submission, back after a refused send. */
	initialDraft?: QuestionFormDraft;
	onSaveDraft?: (draft: QuestionFormDraft) => void;
	/** What he has typed so far, on every change (stranded-draft.ts). */
	onDraftChange?: (text: string) => void;
	/** This line's scope in kept-drafts.ts: his answer survives a reload. */
	keepAs?: string;
	/** The course's carry (kept-drafts.ts): Hint and an ask leave his work
	 *  there, and a question with nothing of its own opens with it. */
	carryAs?: string;
	compactionRunning?: boolean;
}

/** An open question's answer line, as state (spec: answer-slot.md): what
 *  he picked and typed, kept on this Mac per question, Check, Hint and an
 *  ask from the composer. The same answer events as the question dock's
 *  (buildAnswer); only where they are drawn differs. */
export function useSlotQuestionForm({ toolName, toolCallId, input, onSubmit, initialDraft, onSaveDraft, onDraftChange, keepAs, carryAs, compactionRunning = false }: SlotQuestionFormOptions) {
	const kind = toolQuestionKind(toolName);
	const qd = useMemo<QuestionData>(() => {
		const askInput = kind === "ask" ? (input as AskToolInput) : null;
		const explainInput = kind === "explain" ? (input as ExplainToolInput) : null;
		const mode: QuestionMode = askInput?.options?.length ? (askInput.multiSelect === true ? "multi-select" : "single-select") : "text";
		const q: QuestionData = {
			id: toolCallId,
			kind,
			question: input.question,
			context: input.details,
			mode,
			options: normalizeOptions((askInput?.options ?? []) as { label: string; value?: string }[]),
			createdAt: new Date().toISOString(),
		};
		if (explainInput) q.committedAnswer = explainInput.correctAnswer;
		return q;
	}, [toolCallId, kind, input]);
	const textMode = qd.mode === "text";

	const [sel, setSel] = useState<DockSelection>(() => initialDraft?.selection ?? emptyDockSelection());
	const [thinking, setThinking] = useState(initialDraft?.thinking ?? "");
	const [other, setOther] = useState(initialDraft?.other ?? "");
	const [text, setText] = useState(initialDraft?.text ?? "");
	const [confidence, setConfidence] = useState<Confidence>(initialDraft?.confidence ?? DEFAULT_CONFIDENCE);
	const photos = usePhotoDraft(initialDraft?.photos, textMode ? keepAs : undefined);
	const restorePhotos = photos.restore;

	// Where the line starts, after mount so the server's page and the first
	// client render agree: this call's unconfirmed submission, else what he
	// typed here before a reload, else the work Hint, an ask or Done for
	// today carried from the question before, taken once.
	// Nothing is kept until the restored words are in the line: keeping the
	// empty first render would erase them.
	const [restored, setRestored] = useState(false);
	useEffect(() => {
		if (initialDraft) {
			setRestored(true);
			return;
		}
		const kept = keepAs ? keptWords(keepAs)?.form : undefined;
		const carry = !kept && carryAs ? keptWords(carryAs) : undefined;
		const draft = kept ? keptToForm(kept) : carry ? carriedForm(carry, textMode) : undefined;
		if (draft) {
			setSel(draft.selection);
			setThinking(draft.thinking);
			setOther(draft.other);
			setText(draft.text);
			setConfidence(draft.confidence);
		}
		if (carry && carryAs) {
			keepWords(carryAs, null);
			void takeKeptPhotos(carryAs).then((carried) => {
				if (textMode) restorePhotos(carried.map((photo, i) => ({ id: `carried_${i}_${Date.now()}`, photo })));
			});
		}
		setRestored(true);
		// Once, when the question's line mounts.
	}, []);

	const sentRef = useRef(false);
	useEffect(() => {
		if (!keepAs || sentRef.current || !restored) return;
		keepWords(keepAs, { form: formToKept({ selection: sel, thinking, other, text, confidence }) });
	}, [keepAs, restored, sel, thinking, other, text, confidence]);
	const forgetBox = () => {
		sentRef.current = true;
		if (!keepAs) return;
		keepWords(keepAs, null);
		void keepPhotos(keepAs, []);
	};
	const draftChangeRef = useRef(onDraftChange);
	draftChangeRef.current = onDraftChange;
	useEffect(() => {
		draftChangeRef.current?.(formDraftText([text, other, thinking]));
	}, [text, other, thinking]);

	const selectMode: SelectMode = qd.mode === "multi-select" ? "multi-select" : "single-select";
	const toggle = (idx: number) => setSel((prev) => toggleOption(selectMode, prev, idx));
	const selectOther = () => setSel((prev) => toggleOther(selectMode, prev));
	const typeOther = (value: string) => {
		setOther(value);
		setSel((prev) => (prev.otherSelected ? prev : toggleOther(selectMode, prev)));
	};

	// A photo of the working alone answers a typed question.
	const canSubmit = textMode
		? text.trim().length > 0 || photos.photos.length > 0
		: (sel.otherSelected && other.trim().length > 0) || sel.selected.size > 0;

	const snapshot = (): QuestionFormDraft => ({
		selection: { ...sel, selected: new Set(sel.selected) },
		thinking,
		other,
		text,
		confidence,
		...(photos.photos.length ? { photos: photos.photos } : {}),
	});

	const submit = () => {
		if (!canSubmit || compactionRunning) return;
		const req: AnswerRequest = {
			values: [...sel.selected].map((i) => qd.options[i]!.value),
			other: sel.otherSelected ? other : undefined,
			text: textMode ? text : undefined,
			thinking: !textMode ? thinking.trim() || undefined : undefined,
			confidence: kind === "explain" ? confidence : undefined,
		};
		// Snapshot before the optimistic answer unmounts the line.
		onSaveDraft?.(snapshot());
		forgetBox();
		onSubmit(buildAnswer(qd, req, toolName), textMode ? sentPhotos(photos.photos) : undefined);
	};

	/** His work waits in the carry for the question the tutor asks next. */
	const carryWork = () => {
		if (!carryAs) return;
		keepWords(carryAs, { form: formToKept({ selection: sel, thinking, other, text, confidence }) });
		void keepPhotos(carryAs, photos.photos.map((p) => p.photo));
	};

	// Hint (checks only): a request, never an answer, so the committed
	// answer stays hidden and the tutor gives the next rung; the check comes
	// back as a new question and his work fills it.
	const hint = () => {
		if (kind !== "explain" || compactionRunning) return;
		carryWork();
		forgetBox();
		onSubmit(buildAnswer(qd, { text: textMode ? text : undefined, thinking: !textMode ? thinking.trim() || undefined : undefined, hint: true }, toolName));
	};

	/** Words from the composer while the question is open. A check takes
	 *  them as a request beside his work so far, never an answer: the tutor
	 *  replies and asks the check again, and the line comes back as he left
	 *  it. A plain question (never marked) takes them as his reply in his
	 *  own words. */
	const ask = (words: string) => {
		const said = words.trim();
		if (!said || compactionRunning) return false;
		if (kind === "explain") {
			carryWork();
			forgetBox();
			onSubmit(buildAnswer(qd, { text: textMode ? text.trim() || undefined : undefined, thinking: said, hint: true }, toolName));
			return true;
		}
		onSaveDraft?.(snapshot());
		forgetBox();
		onSubmit(buildAnswer(qd, textMode ? { text: said } : { values: [...sel.selected].map((i) => qd.options[i]!.value), other: said, thinking: thinking.trim() || undefined }, toolName));
		return true;
	};

	return { qd, kind, textMode, sel, toggle, selectOther, other, typeOther, text, setText, thinking, setThinking, confidence, setConfidence, photos, canSubmit, submit, hint, ask };
}

export type SlotQuestionForm = ReturnType<typeof useSlotQuestionForm>;
