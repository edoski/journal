import { cn } from "@/lib/utils";
import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { courseTitle, foldLines, lessonTitle, lineKey, whyNow, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";

/** Course, lesson, why now: the same columns on every row. */
const ROW =
	"grid h-13 w-full grid-cols-[9rem_minmax(0,1fr)_auto] items-center justify-items-start gap-x-6 rounded-lg px-3 text-left font-normal whitespace-normal";

/** A hairline above every row but the first, inset to the text's edges. */
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-3 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/**
 * Agenda rows "reason" (spec: reason.md): Today in one quiet panel with
 * hairlines, and on every row why it is there now, in plain words.
 */
export function ReasonRows({ rows, today, busy, onContinue }: RowsProps) {
	const { shown, also } = foldLines(rows);
	return (
		<ul data-slot="reason-rows" className="flex flex-col rounded-xl bg-card p-1">
			{shown.map((row) => {
				const why = whyNow(row, today);
				return (
					<li key={lineKey(row)} className={HAIRLINE}>
						<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" className={ROW}>
							<span className="w-full truncate text-row text-foreground">{courseTitle(row)}</span>
							<span className="w-full truncate text-row font-medium text-foreground">{lessonTitle(row)}</span>
							<span data-slot="today-why" className={cn("max-w-60 justify-self-end truncate text-row", row.kind === "session" ? "text-link" : "text-muted-foreground")}>
								{why}
							</span>
						</LineTarget>
					</li>
				);
			})}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} className={cn(HAIRLINE, "px-3")} />}
		</ul>
	);
}
