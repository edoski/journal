"use client";

import { useRowsVariant } from "@/components/design-variant";
import { DayHeading } from "@/components/study-home/day-heading";
import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { HybridRows } from "@/components/study-home/agenda-rows/hybrid/hybrid-rows";
import { courseTitle, foldLines, lessonTitle, lineKey, pointProps, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";
import type { TodayRow } from "@/components/study-home/study-facts";

/** Both columns of a line, the same on every line, so the course and the
 *  lesson read down the list. */
const LINE =
	"-mx-3 grid h-13 w-[calc(100%+1.5rem)] grid-cols-[9rem_minmax(0,1fr)] items-center justify-items-start gap-x-6 rounded-lg px-3 text-left font-normal whitespace-normal data-[pointed]:bg-fill-hover";

/**
 * Today (spec: today.md): the page's title, then one line per course, each
 * its course and its one next lesson; the whole line opens it. The Rows
 * switch's Proposed draws them as the hybrid row (agenda-rows/hybrid/hybrid.md).
 */
export function Today(props: RowsProps) {
	const hybrid = useRowsVariant() === "proposed";
	return (
		<section aria-labelledby="today-heading" data-slot="today" className="flex shrink-0 flex-col gap-2">
			<DayHeading id="today-heading" />
			{hybrid ? <HybridRows {...props} /> : <TodayLines {...props} />}
		</section>
	);
}

function TodayLines({ rows, busy, onContinue, ...point }: RowsProps) {
	const { shown, also } = foldLines(rows);
	return (
		<ul className="flex flex-col">
			{shown.map((row) => (
				<li key={lineKey(row)}>
					<TodayLine row={row} busy={busy} onContinue={onContinue} point={point} />
				</li>
			))}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} />}
		</ul>
	);
}

/** One line: the course and the lesson in words. The whole line opens the
 *  lesson. */
function TodayLine({ row, busy, onContinue, point }: { row: TodayRow; busy: boolean; onContinue: (workspace: string) => void; point: Pick<RowsProps, "pointed" | "onPoint" | "onPointEnd"> }) {
	return (
		<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" className={LINE} {...pointProps(row, point)}>
			<span className="w-full truncate text-row text-foreground">{courseTitle(row)}</span>
			<span className="w-full truncate text-row font-medium text-foreground">{lessonTitle(row)}</span>
		</LineTarget>
	);
}
