"use client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRowsVariant } from "@/components/design-variant";
import { DayHeading } from "@/components/study-home/day-heading";
import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { ProgressRows } from "@/components/study-home/agenda-rows/progress/progress-rows";
import { ReasonRows } from "@/components/study-home/agenda-rows/reason/reason-rows";
import { RecencyRows } from "@/components/study-home/agenda-rows/recency/recency-rows";
import { actionWord, courseTitle, foldLines, lessonTitle, lineKey, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";
import type { TodayRow } from "@/components/study-home/study-facts";

/** Every column of a line, the same on every line, so the course, the
 *  lesson and the action read down the list. */
const LINE =
	"-mx-3 grid h-13 w-[calc(100%+1.5rem)] grid-cols-[9rem_minmax(0,1fr)_5.5rem] items-center justify-items-start gap-x-6 rounded-lg px-3 text-left font-normal whitespace-normal";

/**
 * Today (spec: today.md): the page's title, then one line per course, each
 * its course and its one next lesson. The first line holds the page's only
 * primary action. The Rows switch draws the lines as one of agenda's row
 * candidates (agenda-rows/agenda-rows.md).
 */
export function Today(props: RowsProps) {
	const variant = useRowsVariant();
	return (
		<section aria-labelledby="today-heading" data-slot="today" className="flex shrink-0 flex-col gap-2">
			<DayHeading id="today-heading" today={props.today} />
			{variant === "reason" ? (
				<ReasonRows {...props} />
			) : variant === "recency" ? (
				<RecencyRows {...props} />
			) : variant === "progress" ? (
				<ProgressRows {...props} />
			) : (
				<TodayLines {...props} />
			)}
		</section>
	);
}

function TodayLines({ rows, busy, onContinue }: RowsProps) {
	const { shown, also } = foldLines(rows);
	return (
		<ul className="flex flex-col">
			{shown.map((row, i) => (
				<li key={lineKey(row)}>
					<TodayLine row={row} primary={i === 0} busy={busy} onContinue={onContinue} />
				</li>
			))}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} />}
		</ul>
	);
}

/** One line: the course, the lesson in words, and on the first line the
 *  action. The whole line opens the lesson. */
function TodayLine({ row, primary, busy, onContinue }: { row: TodayRow; primary: boolean; busy: boolean; onContinue: (workspace: string) => void }) {
	return (
		<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" data-primary={primary || undefined} className={LINE}>
			<span className="w-full truncate text-row text-foreground">{courseTitle(row)}</span>
			<span className="w-full truncate text-row font-medium text-foreground">{lessonTitle(row)}</span>
			<span className="justify-self-end">
				{primary && (
					<span aria-hidden="true" className={cn(buttonVariants({ size: "sm" }), "font-normal")}>
						{actionWord(row)}
					</span>
				)}
			</span>
		</LineTarget>
	);
}
