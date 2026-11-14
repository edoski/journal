"use client";

import { ThinkingBlock } from "@/components/thinking-block";
import { cn } from "@/lib/utils";
import { MessageResponse, ToolContentResponse } from "@/components/ai-elements/message";
import type { QuestionAnswerData } from "@/src/core";
import { answerForPresentation, CONFIDENCE_CHOICES, parseAskInput } from "@/src/core";
import { LessonCard } from "@/components/lesson/lesson-card";

/**
 * Static rendering of an answered question (tool part in `output-available`):
 * a LessonCard (lesson/lesson-card.md) with the question as it was asked,
 * what the learner said (and their thinking), then the committed answer
 * under a hairline.
 *
 * Ask answers are NOT graded — a plain record of what was said. Explain
 * answers are graded by the MODEL in its next reply, not by the client —
 * the card reveals his answer, his confidence and the committed correct
 * answer, with NO verdict (owner ruling 2026-09-27). Answers to the
 * removed multiple-choice tools (quiz, probe) in older transcripts render
 * the same plain way: the question and the option he picked, no grading.
 */
export function AnsweredCard({ answer: savedAnswer, input }: {
	answer: QuestionAnswerData;
	input?: unknown;
}) {
	const answer = answerForPresentation(savedAnswer, input);
	if (answer.dismissed) {
		return (
			<LessonCard data-testid="answered-card" className="text-row text-muted-foreground">
				Skipped: {answer.questionText}
			</LessonCard>
		);
	}
	const isExplain = answer.kind === "explain";
	const selectedIdx = new Set(answer.answers.map((a) => a.index));
	const confidenceLabel = isExplain ? CONFIDENCE_CHOICES.find((c) => c.state === answer.confidence)?.label : undefined;
	const askInput = answer.kind === "ask" ? parseAskInput(input) : undefined;
	const descByIndex = new Map((askInput?.options ?? []).map((o, i) => [i + 1, o.description]));
	const small = "text-muted-foreground [--lh-prose-leading:calc(18/13)] [--lh-prose-size:13px]";
	return (
		<>
			{answer.readingThinking && (
				<ThinkingBlock testId="reading-thinking-block" label="YOUR THINKING" text={answer.readingThinking} defaultOpen />
			)}
			<LessonCard
				data-testid="answered-card"
				label={answer.tool === "recall" ? "Recall" : isExplain ? "Explain" : "Question"}
				note={answer.hintRequested ? <span data-testid="answered-hint">You asked for a hint</span> : confidenceLabel && <span data-testid="answered-confidence">{confidenceLabel}</span>}
			>
				<ToolContentResponse>{answer.questionText}</ToolContentResponse>
				{askInput?.details && <ToolContentResponse className={cn("mt-1", small)}>{askInput.details}</ToolContentResponse>}
				{((answer.options?.length ?? 0) > 0 || answer.other) && (
					<ul className="mt-3 flex flex-col gap-1">
						{answer.options?.map((opt) => {
							const sel = selectedIdx.has(opt.index);
							return (
								<li key={opt.index} className="flex items-start gap-3">
									<span aria-hidden className={cn("mt-[9px] size-2 shrink-0 rounded-full", sel ? "bg-primary" : "ring-1 ring-inset ring-muted-foreground")} />
									<span className={cn("min-w-0", !sel && "text-muted-foreground")}>
										<ToolContentResponse>{opt.label}</ToolContentResponse>
										{descByIndex.get(opt.index) && <ToolContentResponse className={small}>{descByIndex.get(opt.index)}</ToolContentResponse>}
									</span>
								</li>
							);
						})}
						{answer.other && (
							<li data-testid="answered-other" className="flex items-start gap-3">
								<span aria-hidden className="mt-[9px] size-2 shrink-0 rounded-full bg-primary" />
								<MessageResponse className="min-w-0">{`“${answer.other}”`}</MessageResponse>
							</li>
						)}
					</ul>
				)}
				{answer.text && <MessageResponse className="mt-3">{`“${answer.text}”`}</MessageResponse>}
				{(answer.thinking ?? answer.note) && (
					<ThinkingBlock testId="your-thinking" label="YOUR THINKING" text={answer.thinking ?? answer.note ?? ""} inCard />
				)}
				{isExplain && answer.committed && (
					<div className="mt-3 border-t pt-3">
						<div className="mb-1 text-row text-muted-foreground">The answer</div>
						<ToolContentResponse>{answer.committed}</ToolContentResponse>
					</div>
				)}
			</LessonCard>
		</>
	);
}
