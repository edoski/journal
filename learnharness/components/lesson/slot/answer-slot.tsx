"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BookOpenIcon, CheckIcon, EyeIcon, LightbulbIcon, type LucideIcon } from "lucide-react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { useEnterSubmits } from "@/components/enter-submits";
import { PendingPhotos, PhotoAttachButton, sentPhotos, usePhotoDraft } from "@/components/photos";
import { MalformedQuestion } from "@/components/malformed-question";
import { keepWords, keptWords } from "@/components/lesson/kept-drafts";
import { readingKeyScroll } from "@/components/lesson/focus-home";
import { CHOICE_NOTE } from "@/components/study-words";
import { cn } from "@/lib/utils";
import {
	DEFAULT_CONFIDENCE,
	isTypingSurface,
	kbdEventForAction,
	parseAskInput,
	parseExplainInput,
	type AskToolInput,
	type Confidence,
	type ExplainToolInput,
	type KeyAction,
	type Photo,
	type PracticeRequest,
	type QuestionAnswerData,
	type QuestionFormDraft,
} from "@/src/core";
import { useSlotQuestionForm, type SlotQuestionForm } from "@/components/lesson/slot/slot-question-form";
import { SlotConfidence } from "@/components/lesson/slot/slot-confidence";

/** What the lesson can ask of an open answer line: words from the composer
 *  (spec: answer-slot.md, "The composer during a question"). Returns
 *  whether they went. */
export interface AnswerSlotHandle {
	ask: (words: string) => boolean;
}

/** The answer line's field: a hairline underline and no box, in the
 *  lesson's 16px prose so his words read as part of the page. It grows with
 *  his text to 256px, then scrolls with no bar. */
const FIELD =
	"lh-input block field-sizing-content max-h-64 min-h-[calc(1lh+1rem)] w-full resize-none overflow-y-auto border-0 border-b border-border bg-transparent px-0 py-2 text-foreground outline-none transition-colors [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:shadow-[0_1px_0_0_var(--color-ring)] disabled:opacity-60 motion-reduce:transition-none [&::-webkit-scrollbar]:hidden";

/** Focus goes to a new answer line unless he is mid-sentence somewhere
 *  else: a field holding words keeps him. */
function focusIsFree(doc: Document): boolean {
	const active = doc.activeElement as HTMLElement | null;
	if (!active || active === doc.body || !active.isConnected) return true;
	if (active.tagName === "TEXTAREA" || active.tagName === "INPUT") return !(active as HTMLTextAreaElement).value.trim();
	return !active.closest("[role=dialog], [role=menu], [data-radix-popper-content-wrapper]");
}

/** The line's own keys (spec: answer-slot.md): the field's Enter checks,
 *  ⇧Enter is a newline, Esc leaves the field, and an empty field's arrows
 *  and page keys read the lesson. */
function useFieldKeys(onEnter: () => void) {
	const { scrollRef } = useStickToBottomContext();
	return (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			e.currentTarget.blur();
			return;
		}
		if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			onEnter();
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		const el = scrollRef.current;
		const by = el ? readingKeyScroll(e.key, e.currentTarget.value.length === 0, el.clientHeight) : null;
		if (by === null || !el) return;
		e.preventDefault();
		el.scrollBy({ top: by });
	};
}

/** The quiet line under the field: attach, confidence and the requests on
 *  the left, the one action on the right, all 13px on a 32px row. */
function SlotActions({ children, action }: { children: ReactNode; action: ReactNode }) {
	return (
		<div data-slot="slot-actions" className="flex min-h-8 min-w-0 items-center gap-2 pt-1">
			<div className="-ml-2 flex min-w-0 flex-1 items-center">{children}</div>
			{action}
		</div>
	);
}

function CheckButton({ label, disabled, onClick, testId }: { label: string; disabled: boolean; onClick: () => void; testId: string }) {
	return (
		<Button
			type="button"
			size="pill"
			data-testid={testId}
			data-slot="slot-check"
			disabled={disabled}
			onClick={onClick}
			className="shrink-0 transition-opacity hover:bg-primary hover:opacity-90 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
		>
			{label}
		</Button>
	);
}

function RequestButton({ icon: Icon, label, hint, action, testId, disabled, onClick, showIcon = true }: { showIcon?: boolean; icon: LucideIcon; label: string; hint: string; action: KeyAction; testId: string; disabled: boolean; onClick: () => void }) {
	return (
		<Hint label={hint} action={action}>
			<Button type="button" variant="quiet" size="row" data-testid={testId} disabled={disabled} onClick={onClick} aria-label={label} className="px-1.5 font-normal">
				{showIcon && <Icon aria-hidden />}
				{label}
			</Button>
		</Hint>
	);
}

/** A choice's marker, which is also its key: the digit in a 20px square,
 *  filled once picked. */
function ChoiceKey({ n, on, multi }: { n: number; on: boolean; multi: boolean }) {
	return (
		<span
			aria-hidden
			className={cn(
				"mt-[3px] flex size-5 shrink-0 items-center justify-center text-row tabular-nums transition-colors motion-reduce:transition-none",
				multi ? "rounded-[5px]" : "rounded-full",
				on ? "bg-primary text-primary-foreground" : "text-muted-foreground ring-1 ring-inset ring-border",
			)}
		>
			{on && multi ? <CheckIcon className="size-3" strokeWidth={3} /> : n}
		</span>
	);
}

const ROW =
	"-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-md px-2 py-1 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

/** The choices of a question that offers them: rows in the flow, picked by
 *  a click, their digit, or ↑ ↓ then Space. */
function ChoiceRows({ form, walked, onWalk, otherRef, onOtherKeys }: {
	form: SlotQuestionForm;
	walked: number | null;
	onWalk: (idx: number | null) => void;
	otherRef: React.RefObject<HTMLInputElement | null>;
	onOtherKeys: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
	const multi = form.qd.mode === "multi-select";
	const role = multi ? "checkbox" : "radio";
	return (
		<div role={multi ? "group" : "radiogroup"} aria-label="Choices" data-slot="slot-choices" className="flex flex-col">
			{form.qd.options.map((opt, i) => {
				const on = form.sel.selected.has(i);
				return (
					<button
						key={opt.value}
						type="button"
						role={role}
						aria-checked={on}
						data-kbdrow={i}
						data-testid="slot-choice"
						onClick={() => {
							onWalk(i);
							form.toggle(i);
						}}
						className={cn(ROW, on ? "text-foreground" : walked === i ? "bg-fill-hover" : "hover:bg-fill-hover")}
					>
						<ChoiceKey n={i + 1} on={on} multi={multi} />
						<span className="min-w-0">
							<ToolContentResponse>{opt.label}</ToolContentResponse>
							{opt.description && <ToolContentResponse className="text-muted-foreground [--lh-prose-leading:calc(18/13)] [--lh-prose-size:13px]">{opt.description}</ToolContentResponse>}
						</span>
					</button>
				);
			})}
			{form.kind === "ask" && (
				<div
					role={role}
					aria-checked={form.sel.otherSelected}
					data-kbdrow={form.qd.options.length}
					data-testid="other-option"
					onClick={() => {
						onWalk(form.qd.options.length);
						form.selectOther();
						otherRef.current?.focus();
					}}
					className={cn(ROW, "cursor-text", walked === form.qd.options.length && !form.sel.otherSelected && "bg-fill-hover")}
				>
					<ChoiceKey n={form.qd.options.length + 1} on={form.sel.otherSelected} multi={multi} />
					<input
						ref={otherRef}
						value={form.other}
						onChange={(e) => form.typeOther(e.target.value)}
						onKeyDown={onOtherKeys}
						onClick={(e) => e.stopPropagation()}
						placeholder="Your own answer…"
						aria-label="Your own answer"
						className="lh-input min-w-0 flex-1 bg-transparent leading-[26px] outline-none placeholder:text-muted-foreground"
					/>
				</div>
			)}
		</div>
	);
}

export interface AnswerSlotProps {
	toolName: string;
	toolCallId: string;
	input: unknown;
	onSubmit: (output: QuestionAnswerData, photos?: Photo[]) => void;
	initialDraft?: QuestionFormDraft;
	onSaveDraft?: (draft: QuestionFormDraft) => void;
	onDraftChange?: (text: string) => void;
	keepAs?: string;
	carryAs?: string;
	compactionRunning?: boolean;
}

/** An open question's answer line, right under the question in the flow
 *  (spec: answer-slot.md). No card: a hairline field, the choices as rows,
 *  and one quiet line with attach, confidence, Hint and Check. */
export const AnswerSlot = forwardRef<AnswerSlotHandle, AnswerSlotProps>(function AnswerSlot(props, ref) {
	const tool = props.toolName === "recall" ? "explain" : props.toolName;
	const parsed = tool === "explain" ? parseExplainInput(props.input) : parseAskInput(props.input);
	if (!parsed) return <MalformedQuestion />;
	return <QuestionSlot {...props} input={parsed} ref={ref} />;
});

const QuestionSlot = forwardRef<AnswerSlotHandle, Omit<AnswerSlotProps, "input"> & { input: AskToolInput | ExplainToolInput }>(function QuestionSlot(
	{ toolName, toolCallId, input, onSubmit, initialDraft, onSaveDraft, onDraftChange, keepAs, carryAs, compactionRunning = false },
	ref,
) {
	const form = useSlotQuestionForm({ toolName, toolCallId, input, onSubmit, initialDraft, onSaveDraft, onDraftChange, keepAs, carryAs, compactionRunning });
	useImperativeHandle(ref, () => ({ ask: form.ask }), [form.ask]);
	const rootRef = useRef<HTMLDivElement>(null);
	const fieldRef = useRef<HTMLTextAreaElement>(null);
	const otherRef = useRef<HTMLInputElement>(null);
	const [walked, setWalked] = useState<number | null>(null);
	const optionCount = form.textMode ? 0 : form.qd.options.length;
	const rowCount = form.textMode ? 0 : optionCount + (form.kind === "ask" ? 1 : 0);

	useEnterSubmits(form.submit);

	// Focus goes to the line when the question arrives: the field of a typed
	// answer, else the line itself, so digits, arrows and Enter act on it.
	useLayoutEffect(() => {
		if (!focusIsFree(document)) return;
		(form.textMode ? fieldRef.current : rootRef.current)?.focus({ preventScroll: true });
		// Once, when the question's line mounts.
	}, []);

	// Hint by its shortcut, as the dock's.
	const hintRef = useRef(form.hint);
	hintRef.current = form.hint;
	useEffect(() => {
		if (form.kind !== "explain") return;
		const listener = () => hintRef.current();
		window.addEventListener(kbdEventForAction("practice-hint"), listener);
		return () => window.removeEventListener(kbdEventForAction("practice-hint"), listener);
	}, [form.kind]);

	const act = (idx: number) => {
		if (idx < optionCount) form.toggle(idx);
		else {
			form.selectOther();
			otherRef.current?.focus();
		}
	};

	// Digits pick, ↑ ↓ walk, Space picks the walked row, outside a field.
	useEffect(() => {
		if (rowCount === 0) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || isTypingSurface(e)) return;
			if (e.target instanceof HTMLElement && e.target.closest("[role=dialog], [role=menu]")) return;
			if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
				const idx = Number(e.key) - 1;
				if (idx >= rowCount) return;
				e.preventDefault();
				setWalked(idx);
				act(idx);
			} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				if (e.shiftKey) return;
				e.preventDefault();
				setWalked((w) => (e.key === "ArrowDown" ? Math.min((w ?? -1) + 1, rowCount - 1) : Math.max((w ?? rowCount) - 1, 0)));
			} else if (e.key === " " && walked !== null) {
				e.preventDefault();
				act(walked);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	});

	const fieldKeys = useFieldKeys(form.submit);
	const otherKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			e.currentTarget.blur();
			rootRef.current?.focus({ preventScroll: true });
			return;
		}
		if (e.key === "Enter") {
			e.preventDefault();
			form.submit();
		}
	};

	return (
		<div
			ref={rootRef}
			tabIndex={-1}
			data-testid="answer-slot"
			data-slot="answer-slot"
			data-follow-skip=""
			data-mode={form.qd.mode}
			{...(form.textMode ? form.photos.surface : {})}
			className={cn("flex flex-col outline-none", form.photos.dragging && "rounded-md bg-fill-hover")}
		>
			{form.qd.mode === "multi-select" && <p className="pb-1 text-row text-muted-foreground">Pick all that apply.</p>}
			{!form.textMode && <ChoiceRows form={form} walked={walked} onWalk={setWalked} otherRef={otherRef} onOtherKeys={otherKeys} />}
			<textarea
				ref={fieldRef}
				data-testid={form.textMode ? "answer-field" : "thinking-field"}
				data-slot="slot-field"
				aria-label={form.textMode ? "Your answer" : "Anything to add"}
				value={form.textMode ? form.text : form.thinking}
				onChange={(e) => (form.textMode ? form.setText(e.target.value) : form.setThinking(e.target.value))}
				onKeyDown={fieldKeys}
				placeholder={form.textMode ? "Your answer" : CHOICE_NOTE}
				rows={1}
				className={cn(FIELD, !form.textMode && "mt-1")}
			/>
			{form.textMode && <PendingPhotos draft={form.photos} className="px-0" />}
			<SlotActions
				action={<CheckButton label={form.kind === "explain" ? "Check" : "Send"} testId="slot-check" disabled={!form.canSubmit || compactionRunning} onClick={form.submit} />}
			>
				{form.textMode && <PhotoAttachButton draft={form.photos} disabled={compactionRunning} />}
				{form.kind === "explain" && <SlotConfidence value={form.confidence} onChange={form.setConfidence} />}
				{form.kind === "explain" && (
					<RequestButton icon={LightbulbIcon} label="Hint" hint="Get a nudge, not the answer" action="practice-hint" testId="question-hint" disabled={compactionRunning} onClick={form.hint} />
				)}
				{compactionRunning && <span className="truncate px-2 text-row text-muted-foreground">Compacting the conversation…</span>}
			</SlotActions>
		</div>
	);
});

/** The three requests on a problem, in the order the line shows them. */
const REQUESTS: readonly { request: PracticeRequest; label: string; hint: string; icon: LucideIcon; action: KeyAction }[] = [
	{ request: "hint", label: "Hint", hint: "Get a nudge, not the answer", icon: LightbulbIcon, action: "practice-hint" },
	{ request: "show", label: "Show me", hint: "Stop here and see the solution", icon: EyeIcon, action: "practice-show" },
	{ request: "explain", label: "Explain instead", hint: "Leave this problem and be taught the idea", icon: BookOpenIcon, action: "practice-explain" },
];

export interface ProblemSlotProps {
	problemCallId: string;
	/** text + confidence (+ photos): his work on the problem, one lane.
	 *  Resolves false when the server refused it. */
	onSubmit: (text: string, confidence: Confidence, photos?: Photo[]) => Promise<boolean> | void;
	onRequest: (request: PracticeRequest, text: string) => void;
	compactionRunning?: boolean;
	/** The tutor is answering him: Check and the requests wait. */
	busy?: boolean;
	onDraftChange?: (text: string) => void;
	keepAs?: string;
}

/** An open problem's answer line, at the end of the conversation about it
 *  (spec: answer-slot.md): his working, photos, confidence, Hint, Show me,
 *  Explain instead and Check. The same events as the practice dock's. */
export function ProblemSlot({ problemCallId, onSubmit, onRequest, compactionRunning = false, busy = false, onDraftChange, keepAs }: ProblemSlotProps) {
	const waiting = compactionRunning || busy;
	const [thinking, setThinking] = useState("");
	const [confidence, setConfidence] = useState<Confidence>(DEFAULT_CONFIDENCE);
	const photos = usePhotoDraft(undefined, keepAs);
	const fieldRef = useRef<HTMLTextAreaElement>(null);
	const draftChangeRef = useRef(onDraftChange);
	draftChangeRef.current = onDraftChange;
	// Nothing is kept until the restored words are in the field.
	const [restored, setRestored] = useState(false);
	useEffect(() => {
		const kept = keepAs ? keptWords(keepAs)?.text : undefined;
		if (kept) setThinking(kept);
		setRestored(true);
	}, [keepAs]);
	useEffect(() => {
		draftChangeRef.current?.(thinking);
		if (keepAs && restored) keepWords(keepAs, { text: thinking });
	}, [thinking, keepAs, restored]);
	useLayoutEffect(() => {
		if (focusIsFree(document)) fieldRef.current?.focus({ preventScroll: true });
		// Once, when the problem's line mounts.
	}, []);

	const submit = () => {
		if (waiting) return;
		const text = thinking.trim();
		if (text.length === 0 && photos.photos.length === 0) return;
		setThinking("");
		setConfidence(DEFAULT_CONFIDENCE);
		const taken = photos.take();
		void Promise.resolve(onSubmit(text, confidence, sentPhotos(taken))).then((accepted) => {
			if (accepted === false) photos.restore(taken);
		});
	};
	// A request carries the work so far and leaves it in the field.
	const request = (kind: PracticeRequest) => {
		if (waiting) return;
		onRequest(kind, thinking.trim());
	};
	const requestRef = useRef(request);
	requestRef.current = request;
	useEffect(() => {
		const listeners = REQUESTS.map(({ request: kind, action }) => {
			const listener = () => requestRef.current(kind);
			window.addEventListener(kbdEventForAction(action), listener);
			return () => window.removeEventListener(kbdEventForAction(action), listener);
		});
		return () => listeners.forEach((off) => off());
	}, []);
	useEnterSubmits(submit);
	const fieldKeys = useFieldKeys(submit);

	return (
		<div data-testid="problem-slot" data-slot="answer-slot" data-follow-skip="" data-problem={problemCallId} {...photos.surface} className={cn("flex flex-col", photos.dragging && "rounded-md bg-fill-hover")}>
			<textarea
				ref={fieldRef}
				data-testid="practice-thinking-field"
				data-slot="slot-field"
				aria-label="Your working"
				value={thinking}
				onChange={(e) => setThinking(e.target.value)}
				onKeyDown={fieldKeys}
				placeholder="Work here, think out loud."
				rows={1}
				className={FIELD}
			/>
			<PendingPhotos draft={photos} className="px-0" />
			<SlotActions action={<CheckButton label="Check" testId="practice-send" disabled={(thinking.trim().length === 0 && photos.photos.length === 0) || waiting} onClick={submit} />}>
				<PhotoAttachButton draft={photos} disabled={waiting} />
				<SlotConfidence value={confidence} onChange={setConfidence} />
				{compactionRunning ? (
					<span className="truncate px-2 text-row text-muted-foreground">Compacting the conversation…</span>
				) : (
					REQUESTS.map(({ request: kind, label, hint, icon, action }) => (
						<RequestButton key={kind} showIcon={false} icon={icon} label={label} hint={hint} action={action} testId={`practice-request-${kind}`} disabled={waiting} onClick={() => request(kind)} />
					))
				)}
			</SlotActions>
		</div>
	);
}
