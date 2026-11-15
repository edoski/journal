"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type MutableRefObject } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { BookOpenIcon, EyeIcon, LightbulbIcon, MessageCircleQuestionIcon, PenLineIcon, type LucideIcon } from "lucide-react";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { Hint } from "@/components/ui/hint";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEnterSubmits } from "@/components/enter-submits";
import { ShowMeConfirm } from "@/components/abort-turn-dialog";
import { stepConfidence } from "@/components/confidence-choice";
import { usePhotoDraft, sentPhotos } from "@/components/photos";
import { ComposerIcon, LessonComposer, LessonSessionComposer } from "@/components/lesson/lesson-composer";
import { carriedForm, carryWords, formToKept, keepPhotos, keepWords, keptWords, takeCarry } from "@/components/lesson/kept-drafts";
import {
	CONFIDENCE_CHOICES,
	DEFAULT_CONFIDENCE,
	isTypingSurface,
	kbdEventForAction,
	type Confidence,
	type DockSelection,
	type KeyAction,
	type Photo,
	type PracticeRequest,
	type QuestionAnswerData,
	type QuestionFormDraft,
} from "@/src/core";
import type { ProseAnswer } from "@/components/lesson/prose/prose-answer";
import { digitOption, proseAnswer, proseAnswerReady, proseHintRequest, prosePlaceholder, proseQuestionSpec, proseShowMeRequest, type ProseQuestionSpec } from "@/components/lesson/prose/prose-question-data";
import { ChoiceRows, QuestionWords } from "@/components/lesson/prose/prose-question";

/** What waits for his answer: a question the tutor asked, or a problem. */
export type ProseOpen =
	| { kind: "question"; key: string; tool: string; toolCallId: string; input: unknown }
	| { kind: "problem"; toolCallId: string; statement: string };

/** The open item's key: its question key, or the problem's call id. */
export function proseOpenKey(open: ProseOpen | null): string | null {
	return open ? (open.kind === "question" ? open.key : open.toolCallId) : null;
}

/** Its box in kept-drafts.ts, the same scope the docks keep. */
export function proseBox(chatId: string, open: ProseOpen | null): string | null {
	if (!open) return null;
	return open.kind === "question" ? `${chatId}:q:${open.key}` : `${chatId}:p:${open.toolCallId}`;
}

type MessageComposerProps = Omit<ComponentProps<typeof LessonSessionComposer>, "toolbar" | "leading" | "answer" | "head">;

export interface ProseComposerProps {
	open: ProseOpen | null;
	answer: ProseAnswer;
	/** The lesson's own composer, as it is with nothing open. */
	message: MessageComposerProps;
	/** Sends the message draft while a question or problem is open. */
	onAskInstead: () => void;
	/** Esc lands here while something is open: the lesson binds the switch. */
	toggleRef: MutableRefObject<(() => void) | null>;
	busy: boolean;
	chatId: string;
	carryScope?: string;
	/** The question call the open question asks again, left open by a hint
	 *  or a side question just before it: its carried work fills this one. */
	reaskOf?: string | null;
	initialDraft?: QuestionFormDraft;
	onSaveDraft: (draft: QuestionFormDraft) => void;
	onSubmitAnswer: (output: QuestionAnswerData, photos?: Photo[]) => void;
	onSubmitThinking: (text: string, confidence: Confidence, photos?: Photo[]) => Promise<boolean>;
	onRequest: (request: PracticeRequest, text: string) => void;
	onDraftChange: (key: string, text: string) => void;
}

/** The Prose lesson's one composer (spec: prose.md). With nothing open it
 *  is the lesson's composer. While the tutor waits on a question or a
 *  problem it is the answer field: its placeholder says what is wanted,
 *  the requests sit as icons beside attach (Hint, Show me, Explain
 *  instead), how sure he is and the Answer or Ask toggle beside Send, and
 *  Send answers. Esc or the toggle turns it into a message to the tutor
 *  until Esc or the toggle again. */
export function ProseComposer(props: ProseComposerProps) {
	const { open, answer, message, onAskInstead, toggleRef, chatId } = props;
	const box = proseBox(chatId, open);
	const asking = open !== null && answer.mode === "ask";
	// Answer and Ask each keep their own draft (round 8: Esc carried the
	// half answer into Ask, and the side question sent over it destroyed
	// it). The switch only switches: the answer stays in its box, kept
	// across the switch, and the side question in the message box.
	const toggle = useCallback(() => {
		if (!open) return;
		answer.setMode(answer.mode === "answer" ? "ask" : "answer");
	}, [open, answer]);
	toggleRef.current = open ? toggle : null;

	if (!open || asking) {
		const back = open && <ModeToggle mode="ask" kind={open.kind} onToggle={toggle} busy={props.busy} />;
		return (
			<LessonSessionComposer
				{...message}
				{...(open
					? {
							onSend: onAskInstead,
							sendAllowed: true,
							nextProblem: false,
							onEmptyEnter: undefined,
							placeholder: `Ask anything. The ${open.kind} stays open.`,
						}
					: {})}
				toolbar={back}
			/>
		);
	}
	return <AnswerComposer key={proseBox(chatId, open)} {...props} open={open} box={box!} onAsk={toggle} />;
}

function AnswerComposer({
	open,
	answer,
	box,
	onAsk,
	busy,
	carryScope,
	reaskOf,
	initialDraft,
	onSaveDraft,
	onSubmitAnswer,
	onSubmitThinking,
	onRequest,
	onDraftChange,
	message,
}: ProseComposerProps & { open: ProseOpen; box: string; onAsk: () => void }) {
	const spec = useMemo(() => (open.kind === "question" ? proseQuestionSpec(open.tool, open.toolCallId, open.input) : null), [open]);
	const problem = open.kind === "problem";
	const textMode = problem || spec?.mode === "text";
	const { selection, confidence, setConfidence, toggle: pick } = answer;
	const waiting = problem && busy;
	const [text, setText] = useState(() => (initialDraft ? initialDraft.text || initialDraft.other || initialDraft.thinking : ""));
	const textRef = useRef(text);
	textRef.current = text;
	const photos = usePhotoDraft(initialDraft?.photos, textMode ? box : undefined);
	const restorePhotos = photos.restore;

	// Where the field starts, after mount so the server's page and the first
	// client render agree: this call's unconfirmed submission, else what he
	// typed here before a reload, else the work Hint, a side question or
	// Done for today left on this same question, taken once.
	// Saving starts the render after the restore, so the empty first
	// render never overwrites the box it is about to read.
	const [restored, setRestored] = useState(false);
	useEffect(() => {
		if (!initialDraft) {
			const kept = keptWords(box);
			const keptText = kept?.form ? kept.form.text || kept.form.other || kept.form.thinking : kept?.text;
			const carry = !keptText && spec && carryScope ? takeCarry(carryScope, spec.data.question, reaskOf) : undefined;
			const carried = carry ? carriedForm(carry.words, true) : undefined;
			if (keptText) setText(keptText);
			else if (carried) setText(carried.text);
			// How sure he was comes back with his words (round 8: a reload
			// and a refused send reset the meter to Neutral).
			const keptSure = kept?.form?.confidence ?? kept?.confidence;
			if (keptText && keptSure) setConfidence(keptSure);
			else if (carried) setConfidence(carried.confidence);
			void carry?.photos.then((list) => {
				if (textMode) restorePhotos(list.map((photo, i) => ({ id: `carried_${i}_${Date.now()}`, photo })));
			});
		}
		setRestored(true);
		// Once, when the field mounts for this question or problem.
	}, []);

	// Every change is kept for a reload; a sent answer forgets its box.
	const sentRef = useRef(false);
	const keptForm = useCallback(
		(words: string, sel: DockSelection) =>
			formToKept({ selection: sel, thinking: textMode ? "" : words, other: "", text: textMode ? words : "", confidence }),
		[textMode, confidence],
	);
	useEffect(() => {
		if (!restored || sentRef.current) return;
		keepWords(box, problem ? { text, confidence } : { form: keptForm(text, selection) });
	}, [restored, box, problem, text, confidence, selection, keptForm]);
	const draftChangeRef = useRef(onDraftChange);
	draftChangeRef.current = onDraftChange;
	const dockKey = problem ? `p:${open.toolCallId}` : `q:${open.kind === "question" ? open.key : ""}`;
	useEffect(() => {
		draftChangeRef.current(dockKey, text);
	}, [dockKey, text]);
	const forgetBox = () => {
		sentRef.current = true;
		keepWords(box, null);
		void keepPhotos(box, []);
	};

	const ready = !waiting && (problem ? text.trim().length > 0 || photos.photos.length > 0 : spec ? proseAnswerReady(spec, selection, text, photos.photos.length) : false);

	const submit = () => {
		if (!ready) return;
		if (problem) {
			const typed = text;
			const words = typed.trim();
			setText("");
			setConfidence(DEFAULT_CONFIDENCE);
			const taken = photos.take();
			// A send refused at once gives his work back, words and photos,
			// unless he has started writing again.
			const sure = confidence;
			void onSubmitThinking(words, sure, sentPhotos(taken)).then((accepted) => {
				if (accepted) return;
				restorePhotos(taken);
				if (textRef.current.trim()) return;
				setText(typed);
				setConfidence(sure);
			});
			return;
		}
		if (!spec) return;
		const picked = selection.selected.size > 0;
		onSaveDraft({
			selection: { ...selection, selected: new Set(selection.selected) },
			thinking: !textMode && picked ? text : "",
			other: !textMode && !picked ? text : "",
			text: textMode ? text : "",
			confidence,
			...(photos.photos.length ? { photos: photos.photos } : {}),
		});
		forgetBox();
		onSubmitAnswer(proseAnswer(spec, selection, text, confidence), textMode ? sentPhotos(photos.photos) : undefined);
	};
	useEnterSubmits(submit);
	// A single choice picked with nothing typed is his answer: it sends at
	// once, with no second press (round 8: "Anything to add?" waited on a
	// second send). Typed words first keep the pick for Send.
	const picks = answer.picks ?? 0;
	const picksSeen = useRef(picks);
	useEffect(() => {
		const picked = picks > picksSeen.current;
		picksSeen.current = picks;
		if (picked && spec?.mode === "single-select" && selection.selected.size === 1 && !text.trim()) submit();
		// Only a new pick decides.
	}, [picks]);

	// Hint on a check: a request, never an answer. The check comes back
	// as a new question, and his work waits in the carry to fill it.
	const hint = () => {
		if (!spec || spec.kind !== "explain") return;
		if (carryScope) carryWords(carryScope, { question: spec.data.question, from: open.toolCallId }, { form: keptForm(text, selection) }, photos.photos.map((p) => p.photo));
		forgetBox();
		onSubmitAnswer(proseHintRequest(spec, text));
	};
	// Show me gives the check or problem up, so it asks first: once the
	// answer is on screen nothing can take the give-up back (round 8).
	const [confirmShow, setConfirmShow] = useState<"question" | "problem" | null>(null);
	// Show me on a check: he gives up, his words going with it as his work.
	const showMe = () => {
		if (!spec?.showsAnswer || waiting) return;
		setConfirmShow("question");
	};
	const shown = () => {
		const what = confirmShow;
		setConfirmShow(null);
		if (what === "problem") return onRequest("show", text.trim());
		if (!spec?.showsAnswer || waiting) return;
		forgetBox();
		onSubmitAnswer(proseShowMeRequest(spec, text));
	};
	// A request on a problem carries the work so far and leaves it in the field.
	const request = (kind: PracticeRequest) => {
		if (waiting) return;
		if (kind === "show") return setConfirmShow("problem");
		onRequest(kind, text.trim());
	};
	const actRef = useRef({ hint, showMe, request });
	actRef.current = { hint, showMe, request };
	useEffect(() => {
		const binds: [KeyAction, () => void][] = problem
			? [
					["practice-hint", () => actRef.current.request("hint")],
					["practice-show", () => actRef.current.request("show")],
					["practice-explain", () => actRef.current.request("explain")],
				]
			: [
					["practice-hint", () => actRef.current.hint()],
					["practice-show", () => actRef.current.showMe()],
				];
		const offs = binds.map(([action, run]) => {
			window.addEventListener(kbdEventForAction(action), run);
			return () => window.removeEventListener(kbdEventForAction(action), run);
		});
		return () => offs.forEach((off) => off());
	}, [problem]);

	// A digit picks a choice: from anywhere but a field holding words.
	const optionCount = spec && spec.mode !== "text" ? spec.data.options.length : 0;
	const multi = spec?.mode === "multi-select";
	useEffect(() => {
		if (optionCount === 0) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
			const index = digitOption(e.key, optionCount);
			if (index === null) return;
			if (isTypingSurface(e) && (e.target as HTMLTextAreaElement).value !== "") return;
			e.preventDefault();
			pick(index, multi);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [optionCount, multi, pick]);

	const takesConfidence = problem || spec?.kind === "explain";
	const leading = problem ? (
		<>
			<RequestIcon icon={LightbulbIcon} label="Hint" hint="Hint: a nudge, not the answer" action="practice-hint" testId="practice-request-hint" disabled={waiting} onClick={() => request("hint")} />
			<RequestIcon icon={EyeIcon} label="Show me" hint="Show me: stop here and see the solution" action="practice-show" testId="practice-request-show" disabled={waiting} onClick={() => request("show")} />
			<RequestIcon icon={BookOpenIcon} label="Explain instead" hint="Explain instead: leave this problem and be taught the idea" action="practice-explain" testId="practice-request-explain" disabled={waiting} onClick={() => request("explain")} />
		</>
	) : (
		spec?.kind === "explain" && (
			<>
				<RequestIcon icon={LightbulbIcon} label="Hint" hint="Hint: a nudge, not the answer" action="practice-hint" testId="question-hint" disabled={waiting} onClick={hint} />
				{spec.showsAnswer && <RequestIcon icon={EyeIcon} label="Show me" hint="Show me: stop here and see the answer" action="practice-show" testId="question-show" disabled={waiting} onClick={showMe} />}
			</>
		)
	);
	const toolbar = (
		<>
			{takesConfidence && <ConfidenceIcon value={confidence} onChange={setConfidence} />}
			<ModeToggle mode="answer" kind={open.kind} onToggle={onAsk} busy={busy} />
		</>
	);
	const placeholder = problem ? "Work here, think out loud." : spec ? prosePlaceholder(spec, open.kind === "question" ? open.input : null, selection.selected.size > 0) : undefined;
	return (
		<>
			<LessonComposer
				busy={busy}
					value={text}
				onChange={setText}
				onSend={submit}
				onStop={message.onStop}
				canSend={ready}
				placeholder={placeholder}
				leading={leading}
				toolbar={toolbar}
				answer={{ onSubmit: submit, ready, label: problem ? "Submit your work" : "Submit answer" }}
				head={<OpenQuote open={open} spec={spec} selected={selection.selected} onPick={(i) => pick(i, multi)} />}
				photos={textMode ? photos : undefined}
			/>
			{confirmShow && typeof document !== "undefined" && <ShowMeConfirm what={confirmShow} onClose={() => setConfirmShow(null)} onConfirm={shown} />}
		</>
	);
}

/** A request (Hint, Show me, Explain instead) as an icon, its words and
 *  shortcut in its tooltip. */
function RequestIcon({ icon: Icon, label, hint, action, testId, disabled, onClick }: { icon: LucideIcon; label: string; hint: string; action: KeyAction; testId: string; disabled: boolean; onClick: () => void }) {
	return (
		<Hint label={hint} action={action}>
			<ComposerIcon data-testid={testId} aria-label={label} disabled={disabled} onClick={onClick}>
				<Icon />
			</ComposerIcon>
		</Hint>
	);
}

/** Answering or asking, as one two-state control beside Send (spec:
 *  prose.md): the pen while his words answer, the question bubble while
 *  they go to the tutor as a message. A click or Esc switches, Esc only
 *  while the tutor isn't replying (then it stops the reply); ← → move
 *  between the two when it has focus. */
export function ModeToggle({ mode, kind, onToggle, busy }: { mode: "answer" | "ask"; kind: ProseOpen["kind"]; onToggle: () => void; busy: boolean }) {
	const esc = busy ? undefined : "escape";
	const answerWords = kind === "question" ? "Answer the question" : "Work on the problem";
	const askWords = `Ask the tutor instead. The ${kind} stays open`;
	return (
		<ToggleGroup
			type="single"
			variant="segmented"
			value={mode}
			onValueChange={(next) => {
				if (next && next !== mode) onToggle();
			}}
			aria-label="Answer or ask"
			data-slot="composer-mode"
			data-testid="prose-mode"
			data-mode={mode}
		>
			<Hint label={answerWords} binding={esc}>
				<ToggleGroupItem value="answer" aria-label={answerWords} data-testid="prose-answer-mode" className="h-[26px] px-2">
					<PenLineIcon />
				</ToggleGroupItem>
			</Hint>
			<Hint label={askWords} binding={esc}>
				<ToggleGroupItem value="ask" aria-label="Ask the tutor instead" data-testid="prose-ask" className="h-[26px] px-2">
					<MessageCircleQuestionIcon />
				</ToggleGroupItem>
			</Hint>
		</ToggleGroup>
	);
}

/** How sure he is as a meter of three rising bars on lucide's 24px grid:
 *  Guessing lights one, Neutral two, Confident three; the rest stay at 30%.
 *  The bars are wider than the icons' 2px stroke, with rounder ends (Edo,
 *  15 Nov 2026: thin bars read sharp and narrow). */
const METER_BAR_WIDTH = 3.5;
const LIT: Record<Confidence, number> = { guessing: 1, neutral: 2, confident: 3 };

function ConfidenceMeter({ value }: { value: Confidence }) {
	const lit = LIT[value] ?? 2;
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={METER_BAR_WIDTH} strokeLinecap="round" aria-hidden data-lit={lit}>
			{[
				{ x: 6, top: 14 },
				{ x: 12, top: 9 },
				{ x: 18, top: 4 },
			].map((bar, i) => (
				<line key={bar.x} x1={bar.x} x2={bar.x} y1={bar.top} y2={20} strokeOpacity={i < lit ? 1 : 0.3} />
			))}
		</svg>
	);
}

/** How sure he is, Guessing, Neutral or Confident, as the meter. Its words
 *  are in its tooltip; a press steps to the next of the three and leaves
 *  focus in his field, ⌥↑ and ⌥↓ move it from anywhere while it shows. */
export function ConfidenceIcon({ value, onChange }: { value: Confidence; onChange: (next: Confidence) => void }) {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const delta = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
			if (!delta || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented) return;
			e.preventDefault();
			onChange(stepConfidence(value, delta));
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [value, onChange]);
	const at = CONFIDENCE_CHOICES.findIndex((c) => c.state === value);
	const label = CONFIDENCE_CHOICES[at]?.label ?? "Neutral";
	const next = CONFIDENCE_CHOICES[(at + 1) % CONFIDENCE_CHOICES.length]!.state;
	return (
		<Hint label={`How sure you are: ${label}. Press for ${CONFIDENCE_CHOICES.find((c) => c.state === next)?.label ?? "the next"}`} binding="alt+arrowup">
			<ComposerIcon
				data-testid="confidence-choice"
				data-confidence={value}
				pressed={value !== DEFAULT_CONFIDENCE}
				aria-label={`How sure you are: ${label}`}
				// His field keeps focus, so Enter right after sends with this
				// confidence instead of pressing the meter again (round 6).
				onMouseDown={(e) => e.preventDefault()}
				onClick={() => onChange(next)}
			>
				<ConfidenceMeter value={value} />
			</ComposerIcon>
		</Hint>
	);
}

/** The open question, quoted inside the composer once its own words have
 *  scrolled above the view, so a long statement stays in sight while he
 *  works (measured on the 3×5 matrix problem, prose.md). It shows from the
 *  moment the question's first line leaves the view and goes once it is
 *  40px back in, so the composer's own growth never flips it. */
function OpenQuote({ open, spec, selected, onPick }: { open: ProseOpen; spec: ProseQuestionSpec | null; selected: ReadonlySet<number>; onPick: (index: number) => void }) {
	const { scrollRef } = useStickToBottomContext();
	const [quoted, setQuoted] = useState(false);
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const read = () => {
			const questions = [...el.querySelectorAll<HTMLElement>('[data-slot="prose-question"]')];
			const at = questions.findIndex((q) => q.hasAttribute("data-open"));
			// A question asked again after a hint draws its words in the
			// question above the hint, so those words are the ones to watch.
			const block = at > 0 && questions[at]!.hasAttribute("data-repeat") ? questions[at - 1] : questions[at];
			if (!block) return setQuoted(false);
			const top = block.getBoundingClientRect().top - el.getBoundingClientRect().top;
			setQuoted((was) => (was ? top < 40 : top < 0));
		};
		read();
		el.addEventListener("scroll", read, { passive: true });
		const ro = new ResizeObserver(read);
		ro.observe(el);
		if (el.firstElementChild) ro.observe(el.firstElementChild);
		return () => {
			el.removeEventListener("scroll", read);
			ro.disconnect();
		};
	}, [scrollRef]);
	if (!quoted) return null;
	return (
		<div
			data-testid="prose-quote"
			data-slot="composer-quote"
			className="max-h-[min(40dvh,20rem)] overflow-y-auto border-b border-white/5 px-4 pt-3 pb-2.5 text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			{open.kind === "problem" ? (
				<ToolContentResponse className="[--lh-prose-leading:calc(20/14)] [--lh-prose-size:14px]">{open.statement}</ToolContentResponse>
			) : (
				spec && (
					<>
						<QuestionWords spec={spec} compact />
						{spec.mode !== "text" && <ChoiceRows options={spec.data.options} multi={spec.mode === "multi-select"} selected={selected} onPick={onPick} compact />}
					</>
				)
			)}
		</div>
	);
}
