"use client";

import { useState, type ReactNode } from "react";
import { BookmarkIcon, ChevronRightIcon, EyeIcon, LightbulbIcon } from "lucide-react";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { answerForPresentation, type LeftDraft, type Photo, type QuestionAnswerData, type QuestionOption } from "@/src/core";
import { LESSON_WORDS } from "@/components/study-words";
import { cn } from "@/lib/utils";
import { proseQuestionSpec, type ProseQuestionSpec } from "@/components/lesson/prose/prose-question-data";
import { useProseAnswerContext } from "@/components/lesson/prose/prose-answer";
import { LearnerBubble, LearnerWords } from "@/components/lesson/prose/learner-bubble";

/** Small prose: a choice's description, his note on an answer. */
const SMALL_SIZE = "[--lh-prose-leading:calc(20/14)] [--lh-prose-size:14px]";
const SMALL = `text-muted-foreground ${SMALL_SIZE}`;

/** The quiet mark that ends the tutor's message when it hands him the turn,
 *  over the question's words or choices; never over nothing. A question
 *  asked again after his side question has its words above, so its mark
 *  says where they are (round 8: after a direct answer the open question
 *  had no mark at all). */
export function YourTurn({ above = false }: { above?: boolean }) {
	return (
		<p data-slot="your-turn" className="mb-1 text-body text-muted-foreground">
			{above ? "Your turn, on the question above" : "Your turn"}
		</p>
	);
}

/** A question in the tutor's message (spec: prose.md). Open, it ends the
 *  message under "Your turn", its choices plain rows he picks by click or
 *  digit while the composer takes his words. Answered, the question stays
 *  as the tutor asked it, and his answer becomes his bubble with the
 *  record's mark under it. The tutor's committed answer is never drawn:
 *  its reply is the one guarded voice he reads (round 8: the unguarded
 *  card stated a false fact, opened above a stop marker before any reply,
 *  and named the same thing as practice's "Model solution"). */
export function ProseQuestion({ tool, toolCallId, input, output, photos, open, history = false, stepAnchor, repeat = false, afterHint = false, askedBelow = false, spoken = false }: {
	tool: string;
	toolCallId: string;
	input: unknown;
	/** The answer, once he has given one. */
	output?: QuestionAnswerData;
	photos?: readonly Photo[];
	/** This is the question waiting for him. */
	open: boolean;
	/** The session is history (its course was deleted): its open question
	 *  stays as the tutor asked it, waiting on nobody, with no "Your turn"
	 *  (round 20, m5). */
	history?: boolean;
	/** The plan step this question first taught, when the roadmap opens
	 *  the transcript here (roadmap-facts.ts). */
	stepAnchor?: string;
	/** It asks again, word for word, the question he pressed Hint on or
	 *  asked about (`askedAgain`): its words are drawn above already. */
	repeat?: boolean;
	/** The re-ask follows a hint (`askedAfterHint`). */
	afterHint?: boolean;
	/** Set aside with Done for today and asked again further down
	 *  (`leftAskedBelow`): its words are drawn there. */
	askedBelow?: boolean;
	/** The tutor's text just above ends with its words (`spokenAbove`). */
	spoken?: boolean;
}) {
	const spec = proseQuestionSpec(tool, toolCallId, input);
	if (!spec) return null;
	if (open) return <OpenQuestion spec={spec} stepAnchor={stepAnchor} repeat={repeat} afterHint={afterHint} spoken={spoken} history={history} />;
	if (!output) return null;
	return <AnsweredQuestion spec={spec} toolCallId={toolCallId} input={input} output={output} photos={photos} stepAnchor={stepAnchor} repeat={repeat || spoken} askedBelow={askedBelow} />;
}

/** The question's words: the question, and "Select all that apply" for a
 *  choice of many; nothing under them (Edo, 14 Nov 2026: a helper line
 *  under a question is visual bloat). Shared with the composer's quote. */
export function QuestionWords({ spec, compact = false }: { spec: ProseQuestionSpec; compact?: boolean }) {
	return (
		<>
			<ToolContentResponse className={compact ? SMALL_SIZE : undefined}>{spec.data.question}</ToolContentResponse>
			{spec.mode === "multi-select" && !compact && <p className="mt-1 text-body text-muted-foreground">Select all that apply.</p>}
		</>
	);
}

/** An open question ends the message. After a hint the question asked
 *  again is drawn again under "Your turn": "above" would name the hint,
 *  which may end in a question of its own (round 12, 3 D11), and "Your
 *  turn" alone stood over nothing (round 19, m21). The tutor's offer to go
 *  on asks nothing of him, so it has no "Your turn" (round 19, m21). */
function OpenQuestion({ spec, stepAnchor, repeat, afterHint, spoken, history }: { spec: ProseQuestionSpec; stepAnchor?: string; repeat: boolean; afterHint: boolean; spoken: boolean; history: boolean }) {
	const context = useProseAnswerContext();
	const answer = history ? null : context;
	const selected = answer?.selection.selected ?? new Set<number>();
	return (
		<div data-testid="prose-question" data-slot="prose-question" data-open={history ? undefined : ""} data-repeat={repeat ? "" : undefined} data-step-anchor={stepAnchor} className="mt-2">
			{!spec.offer && !history && <YourTurn above={repeat && !afterHint && !spoken && spec.mode === "text"} />}
			{(!repeat || afterHint) && !spoken && <QuestionWords spec={spec} />}
			{spec.mode !== "text" && (
				<ChoiceRows
					options={spec.data.options}
					multi={spec.mode === "multi-select"}
					selected={selected}
					onPick={answer ? (index) => answer.toggle(index, spec.mode === "multi-select") : undefined}
				/>
			)}
		</div>
	);
}

/** The choices as plain rows: the digit that picks it, then its words,
 *  with nothing under them (round 8: helper lines under the goal question's
 *  options, the bloat Edo ruled out under a question on 14 Nov 2026). A
 *  pick fills the row. Rows never take focus: his field keeps it. */
export function ChoiceRows({ options, multi, selected, onPick, compact = false }: {
	options: readonly QuestionOption[];
	multi: boolean;
	selected: ReadonlySet<number>;
	onPick?: (index: number) => void;
	compact?: boolean;
}) {
	return (
		<div role={onPick ? (multi ? "group" : "radiogroup") : undefined} className={cn("-mx-3 flex flex-col", compact ? "mt-1" : "mt-3 gap-0.5")}>
			{options.map((option, i) => {
				const on = selected.has(i);
				const words = (
					<>
						<span aria-hidden className={cn("w-4 shrink-0 text-body tabular-nums", compact ? "leading-5" : "leading-[26px]", on ? "text-foreground" : "text-muted-foreground")}>
							{i + 1}
						</span>
						<span className="min-w-0">
							<ToolContentResponse className={compact ? SMALL_SIZE : undefined}>{option.label}</ToolContentResponse>
						</span>
					</>
				);
				return onPick ? (
					<button
						key={option.value}
						type="button"
						tabIndex={-1}
						role={multi ? "checkbox" : "radio"}
						aria-checked={on}
						data-slot="prose-choice"
						data-picked={on || undefined}
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => onPick(i)}
						className={cn(
							"flex w-full items-start gap-3 rounded-lg px-3 text-left transition-colors motion-reduce:transition-none",
							compact ? "py-0.5" : "py-1.5",
							on ? "bg-fill-selected" : "hover:bg-fill-hover",
						)}
					>
						{words}
					</button>
				) : (
					<div key={option.value} data-slot="prose-choice" className={cn("flex items-start gap-3 px-3", compact ? "py-0.5" : "py-1.5")}>
						{words}
					</div>
				);
			})}
		</div>
	);
}

/** A question Done for today set aside with his half answer: "Left for
 *  next time", and inside it what he had typed, as his bubble (round 15,
 *  3 m1: his half answer was gone). With nothing typed there is nothing to
 *  keep, so nothing shows: the Done for today line under it already says
 *  he stopped (round 16, m16: a bare label sat under the question, and on
 *  Resume above the close). */
function LeftForNextTime({ draft }: { draft?: LeftDraft }) {
	if (!draft?.text.trim()) return null;
	return (
		<div data-testid="prose-question-left">
			<LearnerBubble testId="left-draft" icon={BookmarkIcon} label={LESSON_WORDS.leftForTonight} text={draft.text} />
		</div>
	);
}

function AnsweredQuestion({ spec, toolCallId, input, output, photos, stepAnchor, repeat, askedBelow }: {
	spec: ProseQuestionSpec;
	toolCallId: string;
	input: unknown;
	output: QuestionAnswerData;
	photos?: readonly Photo[];
	stepAnchor?: string;
	repeat: boolean;
	askedBelow: boolean;
}) {
	const answer = answerForPresentation(output, input);
	if (answer.dismissed && answer.reason === "tonight" && askedBelow) {
		// Its words are drawn below; here only his half answer, if any, and
		// the roadmap's anchor for the step it first taught.
		const kept = !!answer.draft?.text.trim();
		if (!kept && !stepAnchor) return null;
		return (
			<div data-slot="prose-question" data-asked-below="" data-step-anchor={stepAnchor} className={kept ? "mt-2" : undefined}>
				<LeftForNextTime draft={answer.draft} />
			</div>
		);
	}
	const question = (
		<div data-testid="prose-question" data-slot="prose-question" data-repeat={repeat ? "" : undefined} data-step-anchor={stepAnchor} className="mt-2">
			{!repeat && <QuestionWords spec={spec} />}
			{spec.mode !== "text" && <ChoiceRows options={spec.data.options} multi={spec.mode === "multi-select"} selected={new Set()} />}
		</div>
	);
	// Set aside for his side question, it stays as asked: it comes back open.
	if (answer.dismissed && answer.reason === "asked") return question;
	if (answer.dismissed) {
		return (
			<>
				{question}
				{answer.reason === "tonight" ? (
					<LeftForNextTime draft={answer.draft} />
				) : (
					<p data-testid="prose-question-left" className="text-body text-muted-foreground">
						{LESSON_WORDS.skippedQuestion}
					</p>
				)}
			</>
		);
	}
	const picked = answer.answers.map((a) => a.label);
	const own = answer.other ?? answer.text;
	const words = [...picked, ...(own ? [own] : [])].join("\n\n");
	const added = answer.thinking ?? answer.note;
	return (
		<>
			{question}
			{answer.readingThinking && <LearnerBubble testId="reading-thinking-bubble" text={answer.readingThinking} />}
			{answer.hintRequested ? (
				<LearnerBubble testId="prose-answer" icon={LightbulbIcon} label="Hint" text={[words, added].filter(Boolean).join("\n\n")} photos={photos} />
			) : answer.showMe ? (
				<LearnerBubble testId="prose-answer" icon={EyeIcon} label="Show me" text={[words, added].filter(Boolean).join("\n\n")} photos={photos} markId={toolCallId} />
			) : (
				<>
					<LearnerBubble testId="prose-answer" text={words} photos={photos} markId={toolCallId}>
						{added && <LearnerWords className={cn(words && "mt-1", SMALL)}>{added}</LearnerWords>}
					</LearnerBubble>
				</>
			)}
		</>
	);
}

/** A quiet disclosure for what the record keeps but the tutor's reply
 *  usually says: a problem's model solution. */
export function Disclosure({ label, children, defaultOpen = false }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<Collapsible open={open} onOpenChange={setOpen} data-slot="prose-disclosure" className="my-1">
			<CollapsibleTrigger
				data-testid="prose-disclosure"
				className="-ms-2 flex h-8 items-center gap-1 rounded-md px-2 text-body text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
			>
				<ChevronRightIcon aria-hidden className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
				{label}
			</CollapsibleTrigger>
			<CollapsibleContent className="pb-1">{typeof children === "string" ? <ToolContentResponse>{children}</ToolContentResponse> : children}</CollapsibleContent>
		</Collapsible>
	);
}
