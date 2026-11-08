"use client";

import { ThinkingBlock } from "@/components/thinking-block";
import { cn } from "@/lib/utils";
import { ToolContentResponse } from "@/components/ai-elements/message";
import type { QuestionAnswerData } from "@/src/core";
import { answerForPresentation, CONFIDENCE_CHOICES, parseAskInput } from "@/src/core";

/**
 * Static rendering of an answered question (tool part in `output-available`).
 *
 * Ask answers are NOT graded — a plain record of what was said. Explain
 * answers are graded by the MODEL in its next reply, not by the client —
 * the card reveals his answer, his confidence and the committed correct
 * answer, with NO verdict chips (owner ruling 2026-09-27). Answers to the
 * removed multiple-choice tools (quiz, probe) in older transcripts render
 * the same plain way: the question and the option he picked, no grading.
 */
export function AnsweredCard({ answer: savedAnswer, input }: { answer: QuestionAnswerData; input?: unknown }) {
	const answer = answerForPresentation(savedAnswer, input);
	if (answer.dismissed) {
		return (
			<div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
				<span className="font-medium">{answer.questionText}</span> — skipped
			</div>
		);
	}

	const isExplain = answer.kind === "explain";
	const selectedIdx = new Set(answer.answers.map((a) => a.index));
	// Older records may carry a numeric confidence (the removed slider);
	// only a three-state word renders.
	const confidenceLabel = isExplain ? CONFIDENCE_CHOICES.find((c) => c.state === answer.confidence)?.label : undefined;
	// The question's own context rides the ORIGINAL CALL, not the answer
	// snapshot (owner, 2026-10-12): the details line — and, for ask
	// questions, option descriptions — re-render from the persisted
	// arguments, so every existing transcript shows them too. The lean
	// snapshot (what the model sees, compactAnswerForModel) is untouched;
	// any parse failure or absent input renders exactly the older card.
	const askInput = answer.kind === "ask" ? parseAskInput(input) : undefined;
	const parsedDetails = askInput?.details;
	const descByIndex = new Map((askInput?.options ?? []).map((o, i) => [i + 1, o.description]));

	return (
		<>
		{/* The reading channel LIFTED (owner round, 2026-10-05): thoughts
		    captured while reading are chronologically PRIOR to the question —
		    rendered as its own user-side block ABOVE the card, the unified
		    ThinkingBlock, instead of an inset inside the answer. Same muted
		    rail as before; the label is now plain "Your thinking". */}
		{answer.readingThinking && (
			<ThinkingBlock testId="reading-thinking-block" label="YOUR THINKING" text={answer.readingThinking} defaultOpen />
		)}
		{/* [&>*:last-child]:mb-0 (owner round, 2026-10-07): on ask cards the
		    thinking row is the last child — its my-3 stacked with the card's
		    p-4 into a 28px void below (12px above); the card's own padding is
		    the bottom rhythm when a row ends the card. */}
		<div
			className="rounded-xl border bg-card p-4 text-card-foreground [&>*:last-child]:mb-0"
			data-testid="answered-card"
		>
			<div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{/* The tool's OWN name first (owner 2026-10-09): probe-phase
				    cards label Recall — the phase boundary visible in the
				    transcript. */}
				{answer.tool === "recall" ? "Recall" : isExplain ? "Explain" : "Question"}
				{confidenceLabel && (
					<span data-testid="answered-confidence" className="rounded bg-muted px-1.5 py-0.5 normal-case">
						{confidenceLabel}
					</span>
				)}
			</div>
			<div className="mb-3 font-medium">
				<ToolContentResponse>{answer.questionText}</ToolContentResponse>
			</div>
			{parsedDetails && (
				// The details line, same paint as the pending dock (owner,
				// 2026-10-12): full markdown, LaTeX included.
				<div className="mb-3 text-sm text-muted-foreground">
					<ToolContentResponse>{parsedDetails}</ToolContentResponse>
				</div>
			)}

			{((answer.options?.length ?? 0) > 0 || answer.other) && (
				<div className="flex flex-col gap-1.5 text-sm">
					{answer.options?.map((opt) => {
						const sel = selectedIdx.has(opt.index);
						return (
							<div
								key={opt.index}
								className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5", sel && "border-primary bg-accent")}
							>
								<span className={cn(!sel && "text-muted-foreground")}>
									<ToolContentResponse>{opt.label}</ToolContentResponse>
									{descByIndex.get(opt.index) && (
										// Ask-option subtext (owner, 2026-10-12): same markdown path
										// as the pending dock — LaTeX included.
										<ToolContentResponse className="lh-prose block text-xs text-muted-foreground">
											{descByIndex.get(opt.index)}
										</ToolContentResponse>
									)}
								</span>
							</div>
						);
					})}
					{/* The learner's own typed option is an OPTION — same container,
					    same selected styling as its siblings, not a loose quote
					    floating outside the list. Quotes keep the learner's words. */}
					{answer.other && (
						<div
							data-testid="answered-other"
							className="flex items-center gap-2 rounded-lg border border-primary bg-accent px-3 py-1.5"
						>
							<span>“{answer.other}”</span>
						</div>
					)}
				</div>
			)}

			{answer.text && <div className="lh-prose mt-2 whitespace-pre-wrap">“{answer.text}”</div>}

			{(answer.thinking ?? answer.note) && (
				/* The SAME unified row (owner round, 2026-10-05): the answer's
				    thinking is the identical collapsible ThinkingBlock — one
				    geometry, but NO band on the card (owner round five, 2026-10-07:
				    the accent lift read too light); rail only, heights identical. */
				<ThinkingBlock
					testId="your-thinking"
					label="YOUR THINKING"
					text={answer.thinking ?? answer.note ?? ""}
					inCard
				/>
			)}

			{/* The explain reveal (owner ruling 2026-09-27): the committed answer
			    — one field, reasoning included — shown on submit; no verdict,
			    the model's next reply IS the grading. */}
			{isExplain && answer.committed && (
				<div className="mt-3 rounded-lg bg-muted py-2 text-sm text-muted-foreground">
					<span className="font-medium text-foreground">The answer: </span>
					<ToolContentResponse className="inline [&>p:first-child]:inline [&>p:first-child]:m-0">{answer.committed}</ToolContentResponse>
				</div>
			)}
		</div>
		</>
	);
}
