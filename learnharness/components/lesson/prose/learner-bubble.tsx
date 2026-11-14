"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { MathText } from "@/components/ui/math-text";
import { SentPhotos } from "@/components/photos";
import { MarkLine } from "@/components/lesson/mark-line";
import type { Photo } from "@/src/core";
import { cn } from "@/lib/utils";

/** His words in the Prose lesson (spec: prose.md): a 16px-radius bubble on
 *  the right, at most 80% of the column, as T3 Code draws the user's
 *  message. A request leads with its icon and one word; photos of his
 *  working follow the words. */
export function LearnerBubble({
	text,
	photos,
	icon: Icon,
	label,
	testId = "user-message",
	markId,
	children,
	className,
}: {
	text?: string;
	photos?: readonly Photo[];
	/** What he asked for, when the bubble is a request (Hint, Show me). */
	icon?: LucideIcon;
	label?: string;
	testId?: string;
	/** The answer whose mark goes on one line under the bubble, its words
	 *  starting where his do. */
	markId?: string;
	children?: ReactNode;
	className?: string;
}) {
	const words = text?.trim();
	const bubble = (
		<div data-testid={testId} data-slot="learner-bubble" className={cn("ms-auto w-fit max-w-full min-w-0 rounded-2xl bg-card px-4 py-2.5", className)}>
			{label && (
				<div className="flex min-h-6 items-center gap-1.5 text-row text-muted-foreground">
					{Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
					{label}
				</div>
			)}
			{words && <LearnerWords className="text-foreground">{words}</LearnerWords>}
			{children}
			{photos && photos.length > 0 && <SentPhotos photos={photos} className={words || label ? "mt-2" : undefined} />}
		</div>
	);
	return (
		<div className="my-1 ms-auto flex w-fit max-w-[80%] min-w-0 flex-col">
			{bubble}
			{markId && <MarkLine answerId={markId} className={MARK_UNDER_BUBBLE} />}
		</div>
	);
}

/** His own words exactly as he typed them (prose.md, "His words"): plain
 *  text with its line breaks, never Markdown, so `2*30`, `[2, ∞)` and
 *  "$5 and $10" read as written. Only maths he wrapped in a delimiter on
 *  purpose is typeset (`MathText`'s rule: `\(…\)`, `$$…$$`, or a `$…$`
 *  hugging its formula, so money stays money). */
export function LearnerWords({ children, className }: { children: string; className?: string }) {
	return (
		<p data-slot="learner-words" className={cn("lh-prose whitespace-pre-wrap break-words", className)}>
			<MathText>{children}</MathText>
		</p>
	);
}

/** The mark reads as his bubble's footnote: its facts end where his words
 *  do, and Dispute shows before them while the line is pointed at. */
const MARK_UNDER_BUBBLE = "flex-row-reverse pe-4";

/** The record's mark for a problem, where the problem ended: under the
 *  bubble that ended it, on the right. */
export function BubbleMark({ answerId }: { answerId: string }) {
	return (
		<div className="ms-auto w-fit max-w-[80%]">
			<MarkLine answerId={answerId} className={MARK_UNDER_BUBBLE} />
		</div>
	);
}
