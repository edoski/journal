"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownIcon, CheckIcon, ChevronRightIcon, LightbulbIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEnterSubmits } from "@/components/enter-submits";
import { MalformedQuestion } from "@/components/malformed-question";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { MathText } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";
import { formDraftText } from "@/components/lesson/stranded-draft";
import {
	buildAnswer,
	kbdEventForAction,
	repairMathForDisplay,
	normalizeQuestionType,
	DEFAULT_CONFIDENCE,
	emptyDockSelection,
	normalizeOptions,
	toolQuestionKind,
	parseAskInput,
	parseExplainInput,
	toggleOption,
	toggleOther,
	type AnswerRequest,
	type AskToolInput,
	type Confidence,
	type DockSelection,
	type ExplainToolInput,
	type QuestionAnswerData,
	type QuestionFormDraft,
	type QuestionData,
	type QuestionMode,
	type SelectMode,
	type Phase3,
} from "@/src/core";
import { ConfidenceChoice } from "@/components/confidence-choice";
import { PendingPhotos, PhotoAttachButton, sentPhotos, usePhotoDraft } from "@/components/photos";
import type { Photo } from "@/src/core";
import { carriedForm, formToKept, keepPhotos, keepWords, keptToForm, keptWords, takeKeptPhotos } from "@/components/lesson/kept-drafts";

/**
 * The question dock — a pending question REPLACES the chat composer: the
 * persistent bottom blob morphs into the question. Two voices meet here:
 * the teacher's (question, options) and the learner's —
 * "Your thinking", a labeled composer-twin field for dumping reasoning,
 * with Submit docked inside it exactly like the chat composer's send.
 *
 * The thinking field is the transfer channel of the whole product (wave-2):
 * never called "optional", Enter makes a NEWLINE (it is for dumping),
 * submission is the button only, and its size scales with the phase
 * (probing stays quick; teaching invites depth). The "Other…" option is
 * an editable option ROW — circle + inline input,
 * styled like its siblings — so picking Other never displaces thinking.
 *
 * Collapse behavior (scroll-up → slim bar) is owned by the DockOverlay in the
 * chat view, which also owns the persistent shell and its height morph. This
 * component is content only. The expanded form stays MOUNTED while collapsed
 * (hidden, not unmounted) so a half-made selection survives scrolling.
 */

export interface QuestionDockProps {
	toolName: "ask_user_question" | "explain" | "recall";
	toolCallId: string;
	input: AskToolInput | ExplainToolInput;
	/** Collapse state, owned by the DockOverlay (it drives the shell's height morph). */
	expanded: boolean;
	/**
	 * Teach-phase check awaiting its reveal (vision §2, W5): while collapsed,
	 * the bar is the "Check your understanding" invitation instead of the
	 * scroll-collapse strip. Owned by the DockOverlay; false once the learner
	 * has revealed (afterwards the normal collapse machine rules apply).
	 */
	reveal?: boolean;
	onExpand: () => void;
	/** The answer, with any photos of his working (text answers only). */
	onSubmit: (output: QuestionAnswerData, photos?: Photo[]) => void;
	/** Restore only this call's unconfirmed submission after recovery. */
	initialDraft?: QuestionFormDraft;
	onSaveDraft?: (draft: QuestionFormDraft) => void;
	/** What he has typed so far, on every change (stranded-draft.ts). */
	onDraftChange?: (text: string) => void;
	/** This box's scope in kept-drafts.ts: his answer survives a reload. */
	keepAs?: string;
	/** The course's carry scope (kept-drafts.ts): Hint leaves his work
	 *  there, and a question with nothing of its own opens with it. */
	carryAs?: string;
	/** The keyboard machine (wave B) is armed only while the dock is
	 *  expanded — the collapsed bar keeps its native Enter-to-expand. */
	active?: boolean;
	/** Session phase at the question — scales the thinking field: probing
	 *  stays quick (one row), teaching invites dumping (three rows). */
	phase?: Phase3;
	/** Compaction is running for this chat (owner round 14): the answer
	 *  POST would block on the server's compaction gate — disable submit
	 *  and say so in the hint row. The server registry is the real gate;
	 *  this is the affordance. */
	compactionRunning?: boolean;
}

export function QuestionDock({
	toolName,
	toolCallId,
	input,
	expanded,
	reveal = false,
	onExpand,
	onSubmit,
	initialDraft,
	onSaveDraft,
	onDraftChange,
	keepAs,
	carryAs,
	phase = "probe",
	compactionRunning = false,
}: QuestionDockProps) {
	// The probe-phase name (owner, 2026-10-09) canonicalizes onto its teach
	// twin for every dock concern — parse dispatch, labels, kinds.
	const canonical = toolName === "recall" ? "explain" : toolName;
	// The chip's display name carries the tool's OWN name (owner
	// 2026-10-09): probe-phase questions label Recall in the composer.
	const toolLabel = toolName === "recall" ? "Recall" : undefined;
	// Parse, don't cast (src/core/tool-parts.ts): the model authored this
	// input, and only the schema the tool declared vouches for its shape.
	// The dock mounts on input-available parts (already validated at the
	// bridge), so this is pure defense in depth — but it is STRUCTURAL now:
	// anything that slips through renders the quiet fallback, never a
	// crash on `.map` over model-authored bytes.
	const parsed = canonical === "explain" ? parseExplainInput(input) : parseAskInput(input);
	if (!parsed) {
		return <MalformedQuestion />;
	}
	return (
		<>
			{!expanded && (
				<QuestionDockBar
					toolName={canonical}
					question={parsed.question}
					onExpand={onExpand}
					variant={reveal ? "reveal" : "collapsed"}
					toolLabel={toolLabel}
					label={
						canonical === "explain" && normalizeQuestionType((parsed as { type?: unknown }).type) === "predict"
							? "Prediction"
							: undefined
					}
				/>
			)}
			<div className={expanded ? "dock-variant" : "invisible h-0 overflow-hidden"}>
				<QuestionDockForm
					toolName={toolName}
					toolCallId={toolCallId}
					input={parsed}
					phase={phase}
					active={expanded}
					onSubmit={onSubmit}
					initialDraft={initialDraft}
					onSaveDraft={onSaveDraft}
					onDraftChange={onDraftChange}
					keepAs={keepAs}
					carryAs={carryAs}
					compactionRunning={compactionRunning}
				/>
			</div>
		</>
	);
}

/** The question as one line of words and inline formulas, for MathText:
 *  display math joins the line, a matrix or a case split (one line can't
 *  hold its rows) folds to ⋯, a tall fraction becomes a text one, and
 *  markdown marks drop. */
export function teaserLine(q: string): string {
	return repairMathForDisplay(q)
		.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$]+?)\$/g, (_, a, b, c, d) => `$${inline(a ?? b ?? c ?? d)}$`)
		.replace(/\*\*|__|`/g, "")
		.replace(/^\s*(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
		.replace(/\s+/g, " ")
		.trim();
}

function inline(tex: string): string {
	return tex
		.replace(/\\begin\{(\w+\*?)\}[\s\S]*?\\end\{\1\}/g, "\\cdots")
		.replace(/\\dfrac/g, "\\tfrac")
		.replace(/\s+/g, " ")
		.trim();
}

/** The collapsed strip. Two species (W5): "collapsed" is the scroll minimization
 *  (kind chip + one-liner + Answer ↓); "reveal" is the teach-check invitation —
 *  a distinct, more inviting affordance, because it asks the learner to start
 *  something, not to resume something. */
export function QuestionDockBar({
	toolName,
	question,
	onExpand,
	variant = "collapsed",
	label,
	toolLabel,
}: {
	toolName: "ask_user_question" | "explain";
	question: string;
	onExpand: () => void;
	variant?: "collapsed" | "reveal";
	/** The kind chip's text (owner 2026-10-03): "Prediction" when a
	 *  predict-type question minimizes by scroll — predictions never use the
	 *  reveal variant, but the scroll-collapse strip can still hide them. */
	label?: string;
	/** The chip's TOOL display name (owner 2026-10-09): probe-phase calls
	 *  label Recall — the phase boundary visible in the composer. */
	toolLabel?: string;
}) {
	const reveal = variant === "reveal";
	return (
		<Button
			variant="list"
			size="row"
			data-testid={reveal ? "teach-check-reveal" : "question-dock-bar"}
			onClick={onExpand}
			className="dock-variant h-12 gap-3 rounded-none px-4 focus-visible:ring-inset"
		>
			<span className={cn("shrink-0", reveal ? "font-medium text-foreground" : "text-muted-foreground")}>
				{reveal ? "Check your understanding" : (label ?? toolLabel ?? (toolName === "explain" ? "Explain" : "Question"))}
			</span>
			<span className="min-w-0 flex-1 truncate text-muted-foreground">
				<MathText>{teaserLine(question)}</MathText>
			</span>
			<span className={cn("flex shrink-0 items-center gap-1", reveal ? "text-link" : "text-foreground")}>
				{reveal ? "Open" : "Answer"}
				{reveal ? <ChevronRightIcon className="size-4" /> : <ArrowDownIcon className="size-4" />}
			</span>
		</Button>
	);
}

/** The expanded question: label, question, options, and the unified bottom row. */
function QuestionDockForm({
	toolName,
	toolCallId,
	input,
	phase = "probe",
	active,
	onSubmit,
	initialDraft,
	onSaveDraft,
	onDraftChange,
	keepAs,
	carryAs,
	compactionRunning = false,
}: Omit<QuestionDockProps, "expanded" | "onExpand" | "reveal">) {
	const kind = toolQuestionKind(toolName);

	// Canonical QuestionData, built once per question.
	const qd = useMemo<QuestionData>(() => {
		const askInput = kind === "ask" ? (input as AskToolInput) : null;
		const explainInput = kind === "explain" ? (input as ExplainToolInput) : null;
		const multi = askInput?.multiSelect === true;
		const mode: QuestionMode = askInput?.options?.length ? (multi ? "multi-select" : "single-select") : "text";
		const q: QuestionData = {
			id: toolCallId,
			kind,
			question: input.question,
			context: input.details,
			mode,
			options: normalizeOptions((askInput?.options ?? []) as { label: string; value?: string }[]),
			createdAt: new Date().toISOString(),
		};
		// The commitment rides the question data (never sent to the client
		// before answering) and snapshots into the answer at submit.
		if (explainInput) q.committedAnswer = explainInput.correctAnswer;
		return q;
	}, [toolCallId, kind, input]);

	// The selection state machine lives in question-core (pure, tested):
	// single-select displaces, multi-select coexists — picking the ask
	// "Other…" row in a multi-select must never clear already-picked
	// options, and picking an option must never clear a typed custom answer.
	const [sel, setSel] = useState<DockSelection>(() => initialDraft?.selection ?? emptyDockSelection());
	// The learner's transfer channel — thinking, never "a note".
	const [thinking, setThinking] = useState(initialDraft?.thinking ?? "");
	const [other, setOther] = useState(initialDraft?.other ?? "");
	const [text, setText] = useState(initialDraft?.text ?? "");
	// The learner's confidence read (explain only). The dock unmounts
	// between questions, so each question starts fresh at neutral.
	const [confidence, setConfidence] = useState<Confidence>(initialDraft?.confidence ?? DEFAULT_CONFIDENCE);
	// Photos of his working: a text answer's only (a choice is a choice).
	const photos = usePhotoDraft(initialDraft?.photos, qd.mode === "text" ? keepAs : undefined);
	const restorePhotos = photos.restore;
	// Where the form starts (kept-drafts.ts), after mount so the server's
	// page and the first client render agree: this call's unconfirmed
	// submission, else what he typed here before a reload, else the work
	// Hint or Done for today carried from the question before, taken once.
	const restoredRef = useRef(false);
	useEffect(() => {
		if (initialDraft) {
			restoredRef.current = true;
			return;
		}
		const kept = keepAs ? keptWords(keepAs)?.form : undefined;
		const carry = !kept && carryAs ? keptWords(carryAs) : undefined;
		const draft = kept ? keptToForm(kept) : carry ? carriedForm(carry, qd.mode === "text") : undefined;
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
				if (qd.mode === "text") restorePhotos(carried.map((photo, i) => ({ id: `carried_${i}_${Date.now()}`, photo })));
			});
		}
		restoredRef.current = true;
		// Once, when the question's form mounts.
	}, []);
	// Every change is kept for a reload; a sent answer forgets its box.
	const sentRef = useRef(false);
	useEffect(() => {
		if (!keepAs || sentRef.current || !restoredRef.current) return;
		keepWords(keepAs, { form: formToKept({ selection: sel, thinking, other, text, confidence }) });
	}, [keepAs, sel, thinking, other, text, confidence]);
	const forgetBox = () => {
		sentRef.current = true;
		if (!keepAs) return;
		keepWords(keepAs, null);
		void keepPhotos(keepAs, []);
	};
	const selectMode: SelectMode = qd.mode === "multi-select" ? "multi-select" : "single-select";
	const draftChangeRef = useRef(onDraftChange);
	draftChangeRef.current = onDraftChange;
	useEffect(() => {
		draftChangeRef.current?.(formDraftText([text, other, thinking]));
	}, [text, other, thinking]);

	const toggle = (idx: number) => setSel(toggleOption(selectMode, sel, idx));

	// A photo of the working alone answers a text question.
	const canSubmit =
		qd.mode === "text"
			? text.trim().length > 0 || photos.photos.length > 0
			: (sel.otherSelected && other.trim().length > 0) || sel.selected.size > 0;

	const submit = () => {
		if (!canSubmit || compactionRunning) return;
		const req: AnswerRequest = {
			values: [...sel.selected].map((i) => qd.options[i]!.value),
			other: sel.otherSelected ? other : undefined,
			text: qd.mode === "text" ? text : undefined,
			thinking: qd.mode !== "text" ? thinking.trim() || undefined : undefined,
			confidence: kind === "explain" ? confidence : undefined,
		};
		// Snapshot before optimistic submission unmounts the form.
		onSaveDraft?.({
			selection: { ...sel, selected: new Set(sel.selected) },
			thinking,
			other,
			text,
			confidence,
			...(photos.photos.length ? { photos: photos.photos } : {}),
		});
		forgetBox();
		onSubmit(buildAnswer(qd, req, toolName), qd.mode === "text" ? sentPhotos(photos.photos) : undefined);
	};

	/* ENTER SUBMITS FROM ANYWHERE (owner round 6, 2026-10-05): the same
	 * law as the practice dock. */
	useEnterSubmits(submit);

	// Hint (checks only): a request, never an answer, so the committed
	// answer stays hidden and the tutor gives the next rung.
	const askHint = () => {
		if (kind !== "explain" || compactionRunning) return;
		// The check comes back after the hint as a new question: his work
		// waits in the carry and fills it (round 3: the field came back empty).
		if (carryAs) {
			keepWords(carryAs, { form: formToKept({ selection: sel, thinking, other, text, confidence }) });
			void keepPhotos(carryAs, photos.photos.map((p) => p.photo));
		}
		forgetBox();
		onSubmit(buildAnswer(qd, { text: qd.mode === "text" ? text : undefined, thinking: qd.mode !== "text" ? thinking.trim() || undefined : undefined, hint: true }, toolName));
	};
	const askHintRef = useRef(askHint);
	askHintRef.current = askHint;
	useEffect(() => {
		if (kind !== "explain") return;
		const listener = () => askHintRef.current();
		window.addEventListener(kbdEventForAction("practice-hint"), listener);
		return () => window.removeEventListener(kbdEventForAction("practice-hint"), listener);
	}, [kind]);
	const hintButton = () =>
		kind === "explain" ? (
			<Hint label="Get a nudge, not the answer" action="practice-hint">
				<Button
					type="button"
					variant="quiet"
					size="pill"
					data-testid="question-hint"
					disabled={compactionRunning}
					onClick={askHint}
				>
					<LightbulbIcon />
					Hint
				</Button>
			</Hint>
		) : null;

	// Selecting Other never clears the thinking field — two channels, the
	// answer and the reasoning behind it, side by side.
	const selectOther = () => setSel(toggleOther(selectMode, sel));

	/* ── The keyboard machine (shortcut wave B, owner rounds 2026-09-17) ──
	   ↑/↓ walk EVERY answerable row in order — options first, then the
	   ask's "Other…" —
	   CLAMPED at the ends, no wrap (owner: faster to navigate when the
	   walk stops at the last row). Space acts on the walked row exactly
	   like a click (multi toggles, single displaces; Other also focuses
	   its input for typing), Enter submits once an answer exists.
	   Tab toggles FOCUS between the thinking field and the answer rows
	   (owner round 3) — nothing else; Shift+Tab is NOT ours (the global
	   handler swallows it). Two guards keep native behavior
	   intact: keys from a TYPING SURFACE keep their meaning (arrows move
	   the caret, space types), and modifier combos are never ours
	   (Alt+arrows cycle sessions — they must not ALSO walk the rows).
	   The listener is document-level and lives only while the dock is
	   expanded — collapsed, the bar's native Enter expands it. */
	const [kbdIdx, setKbdIdx] = useState<number | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const otherInputRef = useRef<HTMLInputElement>(null);
	const thinkingRef = useRef<HTMLTextAreaElement>(null);
	// One row past the options is the trailing "Other…" row. Text mode
	// (ask/explain) has no rows — the composer IS the answer surface.
	const optionCount = qd.mode === "text" ? 0 : qd.options.length;
	const rowCount = qd.mode === "text" ? 0 : optionCount + 1;

	const kbdAct = (idx: number) => {
		if (idx < optionCount) toggle(idx);
		else {
			// Space on the ask's Other row (owner refinement round,
			// 2026-09-24): SELECTING it focuses the input for typing, but
			// the Space that DESELECTS an already-selected Other must never
			// drop the user back into the typing field — the core's
			// toggleOther has no single-select off-path (it displaces), so
			// the off-path lives here: clear the pick, keep the typed text,
			// focus stays where it is. Re-selecting is the way back into
			// the field.
			if (sel.otherSelected) setSel((prev) => ({ ...prev, otherSelected: false }));
			else {
				otherInputRef.current?.focus();
				selectOther();
			}
		}
	};

	// Focus the walked row's focusable element — the Other row is a div,
	// so its inline input is the focus target there.
	const focusRow = (idx: number) => {
		const row = rootRef.current?.querySelector(`[data-kbdrow="${idx}"]`) as HTMLElement | null;
		if (!row) return;
		const el = (row.querySelector("input") as HTMLElement | null) ?? row;
		el.focus();
	};

	useEffect(() => {
		if (!active || rowCount === 0) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			// A TYPING field is where keys mean text (owner round 4): the
			// thinking/answer fields, search boxes, renames. Everywhere else
			// the arrows act.
			const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
			// Alt/Cmd/Ctrl combos are never ours (Alt+arrows cycle sessions
			// globally — they must not ALSO walk the question rows).
			const modded = e.altKey || e.metaKey || e.ctrlKey;
			// Plain Tab toggles focus: rows → thinking. Shift+Tab falls through
			// to the global handler, which does nothing with it.
			if (e.key === "Tab" && !e.shiftKey && !modded) {
				e.preventDefault();
				e.stopPropagation();
				if (t?.closest?.("[data-kbdrow]")) thinkingRef.current?.focus();
				else {
					const idx = kbdIdx ?? 0;
					setKbdIdx(idx);
					focusRow(idx);
				}
				return;
			}
			// Keys from a typing surface keep their meaning (arrows move
			// the caret, space types).
			if (typing || modded) return;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				const next = Math.min((kbdIdx ?? -1) + 1, rowCount - 1);
				setKbdIdx(next);
				// Focus follows the walk while the user is IN the rows (Tab
				// put them there) so focused and walked never diverge.
				if (t?.closest?.("[data-kbdrow]")) focusRow(next);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				const next = Math.max((kbdIdx ?? rowCount) - 1, 0);
				setKbdIdx(next);
				if (t?.closest?.("[data-kbdrow]")) focusRow(next);
			} else if (e.key === " ") {
				if (kbdIdx === null) return; // plain Space keeps scrolling the page
				e.preventDefault();
				kbdAct(kbdIdx);
			} else if (e.key === "Enter") {
				// A picked choice is an answer: Enter on its row sends it,
				// whether the row was walked or clicked (round 3: Enter on a
				// clicked option only re-pressed it, despite "↵ to submit").
				if (!canSubmit || (kbdIdx === null && !t?.closest?.("[data-kbdrow]"))) return;
				e.preventDefault();
				submit();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	});

	// Keep the walked row visible (the question area scrolls internally).
	useEffect(() => {
		if (kbdIdx === null) return;
		rootRef.current
			?.querySelector(`[data-kbdrow="${kbdIdx}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [kbdIdx]);

	const marker = (on: boolean) => (
		<span
			aria-hidden
			className={cn(
				"mt-[5px] flex size-4 shrink-0 items-center justify-center",
				qd.mode === "multi-select" ? "rounded-[4px]" : "rounded-full",
				on ? "bg-primary text-primary-foreground" : "ring-1 ring-inset ring-muted-foreground",
			)}
		>
			{on && (qd.mode === "multi-select" ? <CheckIcon className="size-3" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current" />)}
		</span>
	);
	const row = (on: boolean, walked: boolean) =>
		cn(
			"flex w-full items-start gap-3 rounded-md px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
			on ? "bg-fill-selected" : walked ? "bg-fill-hover" : "hover:bg-fill-hover",
		);
	const fieldKeys = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// The field claims Esc so the window chain doesn't open the
		// question's dismiss confirm under the cursor.
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		// Enter submits, Shift+Enter is a newline, ⌘/Ctrl+Enter submits too.
		if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			submit();
		}
	};
	return (
		<div ref={rootRef} data-testid="question-dock" {...(qd.mode === "text" ? photos.surface : {})} className={cn(photos.dragging && "bg-fill-hover")}>
			<div data-dock-scroll-area="" data-session-find-root="" className="max-h-[var(--dock-max-h,55dvh)] overflow-y-auto px-4 pt-4">
				<ToolContentResponse>{qd.question}</ToolContentResponse>
				{qd.context && (
					<ToolContentResponse className="mt-1.5 text-muted-foreground [--lh-prose-leading:calc(18/13)] [--lh-prose-size:13px]">
						{qd.context}
					</ToolContentResponse>
				)}
				{qd.mode === "multi-select" && <p className="mt-1.5 text-row text-muted-foreground">Select all that apply.</p>}
				{qd.mode !== "text" && (
					<div className="-mx-3 mt-3 flex flex-col gap-0.5" role={qd.mode === "multi-select" ? "group" : "radiogroup"}>
						{qd.options.map((opt, i) => {
							const isSel = sel.selected.has(i);
							return (
								<button
									key={opt.value}
									type="button"
									role={qd.mode === "multi-select" ? "checkbox" : "radio"}
									aria-checked={isSel}
									data-kbdrow={i}
									onClick={() => toggle(i)}
									className={row(isSel, i === kbdIdx)}
								>
									{marker(isSel)}
									<span className="min-w-0">
										<ToolContentResponse>{opt.label}</ToolContentResponse>
										{opt.description && (
											<ToolContentResponse className="text-muted-foreground [--lh-prose-leading:calc(18/13)] [--lh-prose-size:13px]">
												{opt.description}
											</ToolContentResponse>
										)}
									</span>
								</button>
							);
						})}
						{kind === "ask" && (
							<div
								role={qd.mode === "multi-select" ? "checkbox" : "radio"}
								aria-checked={sel.otherSelected}
								data-testid="other-option"
								data-kbdrow={optionCount}
								onClick={selectOther}
								className={row(sel.otherSelected, kbdIdx === optionCount)}
							>
								{marker(sel.otherSelected)}
								<input
									ref={otherInputRef}
									value={other}
									onChange={(e) => {
										setOther(e.target.value);
										setSel((prev) => (prev.otherSelected ? prev : toggleOther(selectMode, prev)));
									}}
									onKeyDown={(e) => {
										if (e.key === "Escape") {
											e.preventDefault();
											e.stopPropagation();
											e.currentTarget.blur();
											setKbdIdx(optionCount);
										}
										if (e.key === "Enter") {
											e.preventDefault();
											submit();
										}
									}}
									placeholder="Type your own answer…"
									className="lh-input w-full min-w-0 flex-1 bg-transparent leading-[26px] outline-none placeholder:text-muted-foreground"
									onClick={(e) => e.stopPropagation()}
								/>
							</div>
						)}
					</div>
				)}
			</div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<div className="mx-4 mt-3 border-t" />
				{qd.mode === "text" && <PendingPhotos draft={photos} />}
				{qd.mode === "text" ? (
					<Textarea
						data-testid="answer-field"
						aria-label="Your answer"
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={fieldKeys}
						placeholder="Your answer"
						rows={1}
						className={cn(
							"block max-h-48 resize-none rounded-none border-0 px-4 pb-1 pt-3 text-control focus-visible:ring-0",
							phase === "teach" ? "min-h-20" : "min-h-12",
						)}
					/>
				) : (
					<Textarea
						ref={thinkingRef}
						data-testid="thinking-field"
						aria-label="Your thinking"
						value={thinking}
						onChange={(e) => setThinking(e.target.value)}
						onKeyDown={fieldKeys}
						placeholder="Why this answer? Whatever comes to mind."
						rows={1}
						className={cn(
							"block max-h-48 resize-none rounded-none border-0 px-4 pb-1 pt-3 text-control focus-visible:ring-0",
							phase === "teach" ? "min-h-20" : "min-h-12",
						)}
					/>
				)}
				<div className="flex items-center gap-3 p-2 pl-3">
					{qd.mode === "text" && <PhotoAttachButton draft={photos} active={active} disabled={compactionRunning} />}
					{kind === "explain" && <ConfidenceChoice value={confidence} onChange={setConfidence} />}
					{hintButton()}
					<span aria-hidden className="min-w-0 truncate text-label text-muted-foreground">
						{compactionRunning ? "Compacting the conversation…" : kind === "explain" ? "" : "↵ to submit · ⇧↵ for a new line"}
					</span>
					<Button
						type="submit"
						disabled={!canSubmit || compactionRunning}
						size="pill"
						className="ml-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
					>
						Submit
					</Button>
				</div>
			</form>
		</div>
	);
}
