import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { courseTitle, foldLines, lessonTitle, lineKey, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";
import { ProgressPie } from "@/components/study-home/agenda-rows/progress-pie";

/** Ring, course, lesson: the same columns on every tile. */
const TILE =
	"grid h-14 w-full grid-cols-[1rem_9rem_minmax(0,1fr)] items-center justify-items-start gap-x-4 rounded-lg bg-card px-4 text-left font-normal whitespace-normal hover:bg-accent";

/**
 * Agenda rows "progress" (spec: progress.md): each course its own tile,
 * led by a ring that fills as the course's topics get taught.
 */
export function ProgressRows({ rows, busy, onContinue }: RowsProps) {
	const { shown, also } = foldLines(rows);
	return (
		<ul data-slot="progress-rows" className="flex flex-col gap-1.5">
			{shown.map((row) => (
				<li key={lineKey(row)}>
					<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" className={TILE}>
						{row.course ? <ProgressPie course={row.course} /> : <span />}
						<span className="w-full truncate text-row text-foreground">{courseTitle(row)}</span>
						<span className="w-full truncate text-row font-medium text-foreground">{lessonTitle(row)}</span>
					</LineTarget>
				</li>
			))}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} className="px-4" />}
		</ul>
	);
}
