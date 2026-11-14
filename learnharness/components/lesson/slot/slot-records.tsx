"use client";

import { useState, type ReactNode } from "react";
import { BookOpenIcon, CheckIcon, ChevronRightIcon, EyeIcon, FlagIcon, LightbulbIcon, MapIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MathText } from "@/components/ui/math-text";
import { MessageResponse, ToolContentResponse } from "@/components/ai-elements/message";
import { TypedText } from "@/components/typed-text";
import { LineText } from "@/components/line-text";
import { SentPhotos } from "@/components/photos";
import { useAnswerMark } from "@/components/answer-mark";
import { MarkLine } from "@/components/lesson/mark-line";
import { LESSON_WORDS, MARK_WORDS } from "@/components/study-words";
import { cn } from "@/lib/utils";
import {
	answerForPresentation,
	CONFIDENCE_CHOICES,
	parseAskInput,
	repairMathForDisplay,
	type ArtifactPartProps,
	type DisputeDetails,
	type Photo,
	type PracticeRequest,
	type PracticeRequestDetails,
	type QuestionAnswerData,
} from "@/src/core";
import type { PracticeThinkingData } from "@/components/practice-cards";

/* The lesson's records in candidate B (spec: answer-slot.md): no cards. A
 * question is the tutor's prose; his answer stays where the answer line
 * was, on its hairline, with the mark on one line under it; what he says
 * to the tutor is a bubble on the right. */

const SMALL = "text-muted-foreground [--lh-prose-leading:calc(18/13)] [--lh-prose-size:13px]";

/** A question as the tutor asked it: its words in the flow, its details
 *  muted under them. */
export function SlotQuestion({ question, details, folded = false }: { question: string; details?: string; folded?: boolean }) {
	// A question he asked help on comes back right after the tutor's reply:
	// here it folds to one muted line, so the page says it once.
	if (folded) {
		return (
			<p data-testid="slot-question" data-slot="slot-question" data-folded="" className="truncate text-row text-muted-foreground">
				<LineText>{repairMathForDisplay(question)}</LineText>
			</p>
		);
	}
	return (
		<div data-testid="slot-question" data-slot="slot-question" className="flex flex-col gap-1">
			<ToolContentResponse>{question}</ToolContentResponse>
			{details && <ToolContentResponse className={SMALL}>{details}</ToolContentResponse>}
		</div>
	);
}

/** One quiet 13px line with an icon: a fact of the record (skipped, a
 *  request), never a card. */
function QuietLine({ icon: Icon, children, testId }: { icon?: LucideIcon; children: ReactNode; testId?: string }) {
	return (
		<p data-testid={testId} className="flex min-h-8 items-center gap-1.5 text-row text-muted-foreground">
			{Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
			{children}
		</p>
	);
}

/** His filled-in line: what he wrote, on the same hairline the answer line
 *  had, so the page reads as a worked sheet. */
function FilledLine({ children, testId }: { children: string; testId?: string }) {
	return (
		<div data-testid={testId} data-slot="slot-filled" className="border-b border-border py-2">
			<TypedText className="text-foreground">{children}</TypedText>
		</div>
	);
}

/** A disclosure under the mark: the tutor's answer or model solution, one
 *  press away (research-ui.md: the model answer goes behind a disclosure). */
function Reveal({ label, children, testId }: { label: string; children: string; testId: string }) {
	const [open, setOpen] = useState(false);
	return (
		<Collapsible open={open} onOpenChange={setOpen} data-testid={testId}>
			<CollapsibleTrigger asChild>
				<Button variant="quiet" size="row" className="-mx-2 font-normal" data-testid={`${testId}-toggle`}>
					<ChevronRightIcon aria-hidden className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
					{label}
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent className="pb-1 pt-1">
				<ToolContentResponse>{children}</ToolContentResponse>
			</CollapsibleContent>
		</Collapsible>
	);
}

function Choice({ n, on, multi, children }: { n: number; on: boolean; multi: boolean; children: ReactNode }) {
	return (
		<li className={cn("flex items-start gap-3 py-1", !on && "text-muted-foreground")}>
			<span
				aria-hidden
				className={cn(
					"mt-[3px] flex size-5 shrink-0 items-center justify-center text-row tabular-nums",
					multi ? "rounded-[5px]" : "rounded-full",
					on ? "bg-primary text-primary-foreground" : "ring-1 ring-inset ring-border",
				)}
			>
				{on && multi ? <CheckIcon className="size-3" strokeWidth={3} /> : n}
			</span>
			<span className="min-w-0">{children}</span>
		</li>
	);
}

/** An answered question (spec: answer-slot.md, "Feedback in place"): the
 *  question where it was asked, his answer on its line, the mark under it
 *  with Dispute, and the tutor's answer behind a disclosure. A hint or an
 *  ask leaves his words as a bubble, or one quiet line. */
export function SlotAnswered({ answerId, answer: saved, input, photos = [] }: { answerId: string; answer: QuestionAnswerData; input?: unknown; photos?: readonly Photo[] }) {
	const answer = answerForPresentation(saved, input);
	const mark = useAnswerMark(answerId);
	const recorded = mark?.rows.some((row) => row.sure !== null) ?? false;
	const askInput = answer.kind === "ask" ? parseAskInput(input) : undefined;
	const details = askInput?.details ?? (input as { details?: unknown } | undefined)?.details;
	const question = <SlotQuestion question={answer.questionText} details={typeof details === "string" ? details : undefined} />;
	if (answer.dismissed) {
		return (
			<div data-testid="slot-answered" data-state="dismissed" className="flex flex-col gap-1">
				{question}
				<QuietLine testId="slot-dismissed">{answer.reason === "tonight" ? LESSON_WORDS.leftForTonight : LESSON_WORDS.skippedQuestion}</QuietLine>
			</div>
		);
	}
	if (answer.hintRequested) {
		const said = answer.thinking?.trim();
		return (
			<div data-testid="slot-answered" data-state="hint" className="flex flex-col gap-2">
				<SlotQuestion question={answer.questionText} folded />
				{said ? <SlotBubble text={said} /> : <QuietLine icon={LightbulbIcon} testId="answered-hint">You asked for a hint</QuietLine>}
			</div>
		);
	}
	const multi = (askInput?.multiSelect ?? false) === true;
	const picked = new Set(answer.answers.map((a) => a.index));
	const descByIndex = new Map((askInput?.options ?? []).map((o, i) => [i + 1, o.description]));
	const confidence = answer.kind === "explain" && !recorded && answer.confidence !== "neutral" ? CONFIDENCE_CHOICES.find((c) => c.state === answer.confidence)?.label : undefined;
	const thinking = answer.thinking ?? answer.note;
	return (
		<div data-testid="slot-answered" data-state="answered" className="flex flex-col gap-1">
			{question}
			{answer.readingThinking && <TypedText className={cn("italic", SMALL)}>{answer.readingThinking}</TypedText>}
			{((answer.options?.length ?? 0) > 0 || answer.other) && (
				<ul data-testid="slot-answered-choices" className="flex flex-col pt-1">
					{answer.options?.map((opt) => (
						<Choice key={opt.index} n={opt.index} on={picked.has(opt.index)} multi={multi}>
							<ToolContentResponse>{opt.label}</ToolContentResponse>
							{descByIndex.get(opt.index) && <ToolContentResponse className={SMALL}>{descByIndex.get(opt.index)}</ToolContentResponse>}
						</Choice>
					))}
					{answer.other && (
						<Choice n={(answer.options?.length ?? 0) + 1} on multi={multi}>
							<TypedText className="text-foreground">{answer.other}</TypedText>
						</Choice>
					)}
				</ul>
			)}
			{answer.text && <FilledLine testId="slot-answered-text">{answer.text}</FilledLine>}
			<SentPhotos photos={photos} className="mt-2" />
			{thinking && <TypedText className={cn("italic", SMALL)}>{thinking}</TypedText>}
			<MarkLine answerId={answerId} />
			{confidence && !mark && <QuietLine testId="answered-confidence">{confidence}</QuietLine>}
			{answer.kind === "explain" && answer.committed && <Reveal label="The answer" testId="slot-reveal">{answer.committed}</Reveal>}
		</div>
	);
}

/** A practice problem's statement: the tutor's prose. */
export function SlotProblem({ part }: ArtifactPartProps) {
	const statement = (part.input as { statement?: unknown } | undefined)?.statement;
	return typeof statement === "string" ? (
		<div data-testid="slot-problem">
			<ToolContentResponse>{statement}</ToolContentResponse>
		</div>
	) : null;
}

/** How a problem ended, in his words, where the engine holds no mark. */
const OUTCOME_WORDS: Record<string, string> = {
	solved: "Solved on your own",
	solvedWithHints: "Solved with a hint",
	movedOn: "Moved on",
	surrendered: "You gave up",
};

/** A problem's end (research-ui.md: fold to a mark line, the solution
 *  behind a disclosure): the tutor's verdict as prose, the mark, then the
 *  model solution one press away. */
export function SlotConclude({ part }: ArtifactPartProps) {
	const input = (part.input ?? {}) as { outcome?: string; verdict?: string; solutionReveal?: string };
	const mark = useAnswerMark(part.toolCallId);
	const outcome = typeof input.outcome === "string" ? input.outcome : "";
	if (outcome === "dismissed") {
		const tonight = (part.output as { reason?: unknown } | undefined)?.reason === "tonight";
		return <QuietLine testId="conclude-card">{tonight ? `${LESSON_WORDS.leftForTonight}.` : LESSON_WORDS.skippedProblem}</QuietLine>;
	}
	const verdict = typeof input.verdict === "string" ? input.verdict : "";
	const reveal = typeof part.reveal === "string" ? part.reveal : typeof input.solutionReveal === "string" ? input.solutionReveal : "";
	return (
		<div data-testid="conclude-card" data-slot="slot-conclude" className="flex flex-col gap-1">
			{verdict && <ToolContentResponse>{verdict}</ToolContentResponse>}
			<MarkLine answerId={part.toolCallId} />
			{!mark && OUTCOME_WORDS[outcome] && <QuietLine>{OUTCOME_WORDS[outcome]}</QuietLine>}
			{reveal && <Reveal label="Model solution" testId="slot-solution">{reveal}</Reveal>}
		</div>
	);
}

/** His work on a problem, sent: his words on their line, his photos. */
export function SlotThinking({ data }: { data: PracticeThinkingData }) {
	return (
		<div data-testid="thinking-card" data-slot="slot-thinking" className="flex flex-col gap-2">
			{data.text.trim() && <FilledLine>{data.text}</FilledLine>}
			{data.photos?.length ? <SentPhotos photos={data.photos} /> : null}
		</div>
	);
}

const REQUEST_LINE: Record<PracticeRequest, { label: string; icon: LucideIcon }> = {
	hint: { label: "You asked for a hint", icon: LightbulbIcon },
	show: { label: "You asked to see the solution", icon: EyeIcon },
	explain: { label: "You asked to be taught this instead", icon: BookOpenIcon },
};

/** A request on a problem: one quiet line. His work stays in the line,
 *  so it is not repeated here. */
export function SlotRequest({ data }: { data: PracticeRequestDetails }) {
	const line = REQUEST_LINE[data.request] ?? REQUEST_LINE.hint;
	return (
		<div data-testid="practice-request-card" data-request={data.request}>
			<QuietLine icon={line.icon}>{line.label}</QuietLine>
		</div>
	);
}

/** His dispute of a mark, as what he said to the tutor. */
export function SlotDispute({ data }: { data: DisputeDetails }) {
	return (
		<div data-testid="dispute-row" className="flex flex-col items-end gap-1">
			<QuietLine icon={FlagIcon}>
				{MARK_WORDS.youDisputed}
				{data.proposed && ` · ${MARK_WORDS.youThink}: ${MARK_WORDS.result[data.proposed]}`}
			</QuietLine>
			{data.said ? <SlotBubble text={data.said} /> : null}
		</div>
	);
}

/** The plan as proposed: one line that opens the plan from the top bar. */
export function SlotPlanLine({ onOpen }: { onOpen: () => void }) {
	return (
		<Button variant="quiet" size="row" data-testid="plan-block-full" aria-label="Open the plan" onClick={onOpen} className="-mx-2 self-start font-normal">
			<MapIcon aria-hidden className="size-3.5" />
			The lesson&apos;s plan
			<ChevronRightIcon aria-hidden className="size-3.5" />
		</Button>
	);
}

/** What he says to the tutor: a bubble on the right, at most 80% wide
 *  (T3 Code's user row). */
export function SlotBubble({ text, photos, markdown = false }: { text?: string; photos?: readonly Photo[]; markdown?: boolean }) {
	return (
		<div data-testid="user-message" data-slot="learner-message" className="ml-auto max-w-[80%] rounded-2xl bg-card px-4 py-2.5">
			{text?.trim() && (markdown ? <MessageResponse className="text-foreground">{text}</MessageResponse> : <p className="lh-prose whitespace-pre-wrap break-words text-foreground"><MathText>{text}</MathText></p>)}
			{photos?.length ? <SentPhotos photos={photos} className={text?.trim() ? "mt-3" : undefined} /> : null}
		</div>
	);
}
