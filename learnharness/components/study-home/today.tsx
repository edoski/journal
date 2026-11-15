"use client";

import { CircleCheckIcon } from "lucide-react";
import { DayHeading } from "@/components/study-home/day-heading";
import { doneWords, type NearExam } from "@/components/study-home/day-record";
import { HybridRows } from "@/components/study-home/agenda-rows/hybrid/hybrid-rows";
import type { RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { MathLine } from "@/components/ui/math-line";

/**
 * Today (spec: today.md): the page's title, what he finished today once he
 * has, then each session to pick up and every step each course's plan
 * holds today, each its course and its lesson; the whole line opens it.
 * The title names an exam in the coming week (`nearExam`), and says when
 * nothing is left today. The lines are agenda's hybrid rows
 * (agenda-rows/hybrid/hybrid.md).
 */
export function Today({ done, exam = null, ...props }: RowsProps & { done: readonly string[]; exam?: NearExam | null; standing?: boolean }) {
	const words = doneWords(done);
	return (
		<section aria-labelledby="today-heading" data-slot="today" className="flex shrink-0 flex-col gap-2">
			<DayHeading id="today-heading" studied={words !== null} exam={exam} empty={props.rows.length === 0} />
			{words && (
				<p data-slot="today-done" className="-mt-1 flex h-5 min-w-0 items-center gap-1.5 text-callout system-current:text-label text-muted-foreground">
					<CircleCheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
					<MathLine className="min-w-0">{words}</MathLine>
				</p>
			)}
			<HybridRows {...props} />
		</section>
	);
}
