import { cn } from "@/lib/utils";
import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { ProgressPie } from "@/components/study-home/agenda-rows/progress-pie";
import { courseTitle, foldLines, lastStudied, lessonTitle, lineKey, whyNow, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";

/** The pie beside both lines; the course line with when he last studied
 *  it at its end, then the lesson line with why now at its end. The ends
 *  sit flush right, so each lines up down the list. */
const ROW =
	"-mx-3 grid h-16 w-[calc(100%+1.5rem)] grid-cols-[1rem_minmax(0,1fr)_auto] grid-rows-[auto_auto] content-center items-baseline gap-x-4 gap-y-1 rounded-lg px-3 text-left font-normal whitespace-normal";

/** A hairline above every row but the first, inset to the text's edges. */
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/**
 * Agenda rows "hybrid" (spec: hybrid.md): progress, recency and reason,
 * each beside what it is about. The pie leads the course; the course line
 * ends with when he last studied it; the lesson line ends with why it is
 * there today.
 * No surface; hairlines between rows.
 */
export function HybridRows({ rows, today, busy, onContinue }: RowsProps) {
	const { shown, also } = foldLines(rows);
	return (
		<ul data-slot="hybrid-rows" className="flex flex-col">
			{shown.map((row) => {
				const studied = lastStudied(row);
				return (
					<li key={lineKey(row)} className={HAIRLINE}>
						<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" className={ROW}>
							<span className="row-span-2 self-center">{row.course && <ProgressPie course={row.course} />}</span>
							<span className="truncate text-label text-muted-foreground">{courseTitle(row)}</span>
							<span data-slot="today-when" className="justify-self-end text-label text-muted-foreground">
								{studied}
							</span>
							<span className="truncate text-control font-medium text-foreground">{lessonTitle(row)}</span>
							<span data-slot="today-why" className={cn("max-w-64 justify-self-end truncate text-row", row.kind === "session" ? "text-link" : "text-muted-foreground")}>
								{whyNow(row, today)}
							</span>
						</LineTarget>
					</li>
				);
			})}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} className={HAIRLINE} />}
		</ul>
	);
}
