import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { ProgressPie } from "@/components/study-home/agenda-rows/progress-pie";
import { courseTitle, foldLines, lessonTitle, lineKey, pointProps, studiedAgo, whyOf, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";
import { WhyMark } from "@/components/study-home/agenda-rows/why-mark";
import { MathText } from "@/components/ui/math-text";

/** The pie beside both lines; the course line with when he last studied
 *  it at its end, then the lesson line with why now at its end. The ends
 *  sit flush right, so each lines up down the list. */
const ROW =
	"-mx-3 grid h-16 w-[calc(100%+1.5rem)] grid-cols-[1rem_minmax(0,1fr)_auto] grid-rows-[auto_auto] content-center items-center gap-x-4 gap-y-1 rounded-lg px-3 text-left font-normal whitespace-normal data-[pointed]:bg-fill-hover";

/** A hairline above every row but the first, inset to the text's edges. */
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/**
 * Agenda rows "hybrid" (spec: hybrid.md): progress, recency and reason,
 * each beside what it is about. The pie leads the course; the course line
 * ends with when he last studied it; the lesson line ends with why it is
 * there today, as an icon and a few words.
 */
export function HybridRows({ rows, today, busy, onContinue, ...point }: RowsProps) {
	const { shown, also } = foldLines(rows);
	return (
		<ul data-slot="hybrid-rows" className="flex flex-col">
			{shown.map((row) => (
				<li key={lineKey(row)} className={HAIRLINE}>
					<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" className={ROW} {...pointProps(row, point)}>
						<span className="row-span-2">{row.course && <ProgressPie course={row.course} />}</span>
						<span className="truncate text-label text-muted-foreground"><MathText>{courseTitle(row)}</MathText></span>
						<span data-slot="today-when" className="justify-self-end text-label text-muted-foreground tabular-nums">
							{studiedAgo(row)}
						</span>
						<span className="truncate text-control font-medium text-foreground"><MathText>{lessonTitle(row)}</MathText></span>
						<WhyMark why={whyOf(row, today)} />
					</LineTarget>
				</li>
			))}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} className={HAIRLINE} />}
		</ul>
	);
}
