"use client";

import { DayHeading } from "@/components/study-home/day-heading";
import { HybridRows } from "@/components/study-home/agenda-rows/hybrid/hybrid-rows";
import type { RowsProps } from "@/components/study-home/agenda-rows/row-facts";

/**
 * Today (spec: today.md): the page's title, then one line per course, each
 * its course and its one next lesson; the whole line opens it. The lines
 * are agenda's hybrid rows (agenda-rows/hybrid/hybrid.md).
 */
export function Today(props: RowsProps) {
	return (
		<section aria-labelledby="today-heading" data-slot="today" className="flex shrink-0 flex-col gap-2">
			<DayHeading id="today-heading" />
			<HybridRows {...props} />
		</section>
	);
}
