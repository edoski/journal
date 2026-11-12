import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { actionWord, courseTitle, foldLines, lastStudied, lessonTitle, lineKey, whyNow, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";

/** The two lines, then the action, the same on every row. */
const ROW = "-mx-3 grid h-16 w-[calc(100%+1.5rem)] grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-6 rounded-lg px-3 text-left font-normal whitespace-normal";

/**
 * Agenda rows "recency" (spec: recency.md): each row two lines, as Mail
 * and T3 Code draw a thread. The course and when he last studied it, then
 * the lesson; hairlines between rows.
 */
export function RecencyRows({ rows, today, busy, onContinue }: RowsProps) {
	const { shown, also } = foldLines(rows);
	return (
		<ul data-slot="recency-rows" className="flex flex-col divide-y divide-border/50">
			{shown.map((row, i) => (
				<li key={lineKey(row)}>
					<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" data-primary={i === 0 || undefined} className={ROW}>
						<span className="flex min-w-0 flex-col gap-1">
							<span className="flex min-w-0 items-baseline justify-between gap-4 text-label">
								<span className="truncate text-muted-foreground">{courseTitle(row)}</span>
								<span data-slot="today-when" className={cn("shrink-0 tabular-nums", row.kind === "session" ? "font-medium text-link" : "text-muted-foreground")}>
									{row.kind === "session" ? whyNow(row, today) : lastStudied(row)}
								</span>
							</span>
							<span className="truncate text-control font-medium text-foreground">{lessonTitle(row)}</span>
						</span>
						<span className="justify-self-end">
							{i === 0 && (
								<span aria-hidden="true" className={cn(buttonVariants({ size: "sm" }), "font-normal")}>
									{actionWord(row)}
								</span>
							)}
						</span>
					</LineTarget>
				</li>
			))}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} />}
		</ul>
	);
}
