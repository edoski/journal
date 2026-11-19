import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { MathLine } from "@/components/ui/math-line";
import { mathPlain } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";
import { courseTitle, lessonTitle, lineKey, whyOf } from "@/components/study-home/agenda-rows/row-facts";
import type { TodayRow } from "@/components/study-home/study-facts";
import type { TakeLine } from "@/components/start/use-lesson-start";
import { linePress } from "@/components/study-home/agenda-rows/line-target";

/** What a folded line's button leaves out, for its tooltip: its course and
 *  why it is on Today, as a full line says them: "Calculus I. Back in 21d".
 *  Pure. */
export function alsoHint(row: TodayRow): string {
	const why = whyOf(row);
	return `${mathPlain(courseTitle(row))}${why ? `. ${why.short}` : ""}`;
}

/** Past five lines, the last line: "Also today:" and each further line as
 *  a quiet button named by its lesson, as a full line names it, that opens
 *  it, its tooltip naming its course and why; the label sits as far from
 *  the first lesson as the lessons sit from each other. A lesson that does
 *  not fit the room left on its line goes whole onto the next, under the
 *  first (round 18, m11: "Continue Problem sheet 4: rank and null…" cut
 *  with a line's room below); only a lesson wider than a whole line is cut
 *  at its end, never inside a formula. */
export function TodayAlso({ rows, busy, onContinue, className }: { rows: readonly TodayRow[]; busy: boolean; onContinue: TakeLine; className?: string }) {
	const label = "min-w-0 max-w-full text-body font-normal text-foreground";
	return (
		<li data-slot="today-also" className={cn("flex min-h-13 min-w-0 items-start gap-1 py-2.5 text-body text-muted-foreground", className)}>
			<span className="mr-3 flex h-8 shrink-0 items-center">Also today:</span>
			<span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
				{rows.map((row) => {
					const press = linePress(row);
					return (
						<Hint key={lineKey(row)} label={alsoHint(row)} side="top">
							{"href" in press ? (
								<Button variant="quiet" size="sm" asChild data-line={lineKey(row)} className={label}>
									<Link href={press.href}>
										<MathLine>{lessonTitle(row)}</MathLine>
									</Link>
								</Button>
							) : (
								<Button variant="quiet" size="sm" disabled={busy} onClick={() => onContinue(press.course.map.workspace, press.step)} data-line={lineKey(row)} className={label}>
									<MathLine>{lessonTitle(row)}</MathLine>
								</Button>
							)}
						</Hint>
					);
				})}
			</span>
		</li>
	);
}
