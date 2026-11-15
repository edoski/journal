import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A record in the lesson column (spec: lesson-card.md): an answered
 *  question, a practice problem or its conclusion, a probe summary, the
 *  plan. One raised surface, radius 12, an optional sentence-case label
 *  row with a quiet trailing note. */
export function LessonCard({
	label,
	note,
	className,
	children,
	...props
}: ComponentProps<"div"> & {
	/** The card's kind in sentence case ("Check", "Problem"); 13px muted. */
	label?: ReactNode;
	/** Quiet text after the label ("Confident", "Solved"). */
	note?: ReactNode;
}) {
	return (
		<div data-slot="lesson-card" className={cn("rounded-xl border bg-card p-4 text-card-foreground", className)} {...props}>
			{(label || note) && (
				<div data-slot="lesson-card-label" className="mb-2 flex items-center gap-1.5 text-row text-muted-foreground">
					{label}
					{label && note && <span aria-hidden>·</span>}
					{note}
				</div>
			)}
			{children}
		</div>
	);
}
