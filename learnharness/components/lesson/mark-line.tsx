"use client";

import { FlagIcon, ScaleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { RowFacts, useAnswerMark, useAnswerMarkActions } from "@/components/answer-mark";
import type { MarkRow } from "@/src/core";
import { cn } from "@/lib/utils";
import { MARK_WORDS } from "@/components/study-words";

/** How the record marked his answer, as one 13px line under his bubble
 *  (spec: mark-line.md): the result, how it counted, the confidence
 *  recorded, whether it was disputed and whether the mark stood (the
 *  ruling's words are the tutor's reply); a problem's tries one line each.
 *  The facts end where his words end,
 *  on the bubble's right padding; Dispute shows just before them while the
 *  line is pointed at or focused, drawn out of the line's flow so a hidden
 *  button never pushes the facts in. The engine's mark only
 *  (answer-mark.tsx), never the app's judgement; nothing until the engine
 *  holds one. */
export function MarkLine({ answerId }: { answerId: string }) {
	const mark = useAnswerMark(answerId);
	if (!mark) return null;
	// One try: the whole line shows its Dispute. Several: each try has its
	// own, shown beside the try pointed at (round 16, m19: one Dispute for
	// "First try" and "Then" never said which try a pick would set).
	const several = mark.rows.length > 1;
	return (
		<div data-testid="mark-line" data-slot="mark-line" className="group/mark flex min-h-8 min-w-0 justify-end pe-4 text-body text-muted-foreground">
			<div data-slot="mark-facts" className={cn("flex min-w-0 flex-col items-end justify-center gap-y-1", !several && "relative")}>
				{!several && <DisputePress answerId={answerId} keyed />}
				{mark.rows.map((row, i) =>
					several ? (
						<span key={row.id} className="group/try relative flex min-w-0">
							<DisputePress answerId={answerId} row={row} keyed={i === mark.rows.length - 1} />
							<RowFacts row={row} />
						</span>
					) : (
						<RowFacts key={row.id} row={row} />
					),
				)}
				{mark.disputed && (
					<span data-testid="mark-disputed" className="inline-flex min-w-0 items-center gap-1.5">
						<ScaleIcon aria-hidden className="size-3.5 shrink-0" />
						{MARK_WORDS.disputed} · {mark.changed ? MARK_WORDS.markChanged : MARK_WORDS.markStands}
					</span>
				)}
			</div>
		</div>
	);
}

/** Dispute, drawn just before the facts and out of the line's flow, so
 *  while hidden it takes no room. On a try's own line it names the try
 *  for a screen reader. `keyed`: the one ⌘⇧M opens, the last try. */
function DisputePress({ answerId, row, keyed }: { answerId: string; row?: MarkRow; keyed: boolean }) {
	const { onDispute, canDispute } = useAnswerMarkActions();
	return (
		<Hint label={MARK_WORDS.disputeTitle} action={keyed ? "dispute-mark" : undefined}>
			<Button
				variant="quiet"
				size="row"
				data-testid="dispute-mark"
				data-row={row?.id}
				aria-label={row?.label ? `${MARK_WORDS.dispute}: ${row.label}` : undefined}
				disabled={!canDispute}
				onClick={() => onDispute(answerId, row?.id)}
				className={cn(
					"absolute top-1/2 right-full me-2 -translate-y-1/2 opacity-0 transition-opacity focus-visible:opacity-100 motion-reduce:transition-none",
					row ? "group-hover/try:opacity-100" : "group-hover/mark:opacity-100",
				)}
			>
				<FlagIcon aria-hidden className="size-3.5" />
				{MARK_WORDS.dispute}
			</Button>
		</Hint>
	);
}
