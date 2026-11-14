"use client";

import { FlagIcon, ScaleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { MathText } from "@/components/ui/math-text";
import { RowFacts, useAnswerMark, useAnswerMarkActions } from "@/components/answer-mark";
import { MARK_WORDS } from "@/components/study-words";

/** How the record marked his answer, as one 13px line under his bubble
 *  (spec: mark-line.md): the result, how it counted, the confidence
 *  recorded, whether it was disputed; a problem's tries one line each.
 *  The facts end where his words end,
 *  on the bubble's right padding; Dispute shows just before them while the
 *  line is pointed at or focused, drawn out of the line's flow so a hidden
 *  button never pushes the facts in. The engine's mark only
 *  (answer-mark.tsx), never the app's judgement; nothing until the engine
 *  holds one. */
export function MarkLine({ answerId }: { answerId: string }) {
	const mark = useAnswerMark(answerId);
	const { onDispute, canDispute } = useAnswerMarkActions();
	if (!mark) return null;
	return (
		<div data-testid="mark-line" data-slot="mark-line" className="group/mark flex min-h-8 min-w-0 justify-end pe-4 text-row text-muted-foreground">
			<div data-slot="mark-facts" className="relative flex min-w-0 flex-col items-end justify-center gap-y-1">
				<Hint label={MARK_WORDS.disputeTitle} action="dispute-mark">
					<Button
						variant="quiet"
						size="row"
						data-testid="dispute-mark"
						disabled={!canDispute}
						onClick={() => onDispute(answerId)}
						className="absolute top-1/2 right-full me-2 -translate-y-1/2 opacity-0 transition-opacity group-hover/mark:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none"
					>
						<FlagIcon aria-hidden className="size-3.5" />
						{MARK_WORDS.dispute}
					</Button>
				</Hint>
				{mark.rows.map((row) => (
					<RowFacts key={row.id} row={row} />
				))}
				{mark.disputed && (
					<span data-testid="mark-disputed" className="inline-flex min-w-0 items-center gap-1.5">
						<ScaleIcon aria-hidden className="size-3.5 shrink-0" />
						<span className="min-w-0">
							{MARK_WORDS.disputed}
							{mark.ruling && <span className="text-muted-foreground/80">: <MathText>{mark.ruling}</MathText></span>}
						</span>
					</span>
				)}
			</div>
		</div>
	);
}
