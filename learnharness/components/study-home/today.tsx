"use client";

import { CircleCheckIcon } from "lucide-react";
import { DayHeading } from "@/components/study-home/day-heading";
import { doneWords } from "@/components/study-home/day-record";
import { HybridRows } from "@/components/study-home/agenda-rows/hybrid/hybrid-rows";
import type { RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { MathLine } from "@/components/ui/math-line";

/**
 * Today (spec: today.md): the page's title, what he finished today once he
 * has, then one line per course, each its course and its one next lesson;
 * the whole line opens it. The lines are agenda's hybrid rows
 * (agenda-rows/hybrid/hybrid.md).
 */
export function Today({ done, ...props }: RowsProps & { done: readonly string[] }) {
	const words = doneWords(done);
	return (
		<section aria-labelledby="today-heading" data-slot="today" className="flex shrink-0 flex-col gap-2">
			<DayHeading id="today-heading" studied={words !== null} />
			{words && (
				<p data-slot="today-done" className="-mt-1 flex h-5 min-w-0 items-center gap-1.5 text-label text-muted-foreground">
					<CircleCheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
					<MathLine className="min-w-0">{words}</MathLine>
				</p>
			)}
			<HybridRows {...props} />
		</section>
	);
}
