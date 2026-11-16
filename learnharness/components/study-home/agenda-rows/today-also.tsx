import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { MathLine } from "@/components/ui/math-line";
import { mathPlain } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";
import { courseTitle, lessonTitle, lineKey, whyOf } from "@/components/study-home/agenda-rows/row-facts";
import type { NextStep, TodayRow } from "@/components/study-home/study-facts";
import { continueHref } from "@/components/nav/session-state";

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
 *  the first lesson as the lessons sit from each other. A lesson too long
 *  for the room left is cut at its end, never inside a formula. */
export function TodayAlso({ rows, busy, onContinue, className }: { rows: readonly TodayRow[]; busy: boolean; onContinue: (workspace: string, step?: NextStep) => void; className?: string }) {
	const label = "min-w-0 shrink text-body system-current:text-row font-normal system-current:font-normal text-foreground";
	return (
		<li data-slot="today-also" className={cn("flex h-13 min-w-0 items-center gap-1 text-body system-current:text-row text-muted-foreground", className)}>
			<span className="mr-3 shrink-0">Also today:</span>
			{rows.map((row) => (
				<Hint key={row.kind === "session" ? row.chat.id : row.course.map.workspace} label={alsoHint(row)} side="top">
					{row.kind === "session" ? (
						<Button variant="quiet" size="sm" asChild data-line={lineKey(row)} className={label}>
							<Link href={continueHref(row.chat)}>
								<MathLine>{lessonTitle(row)}</MathLine>
							</Link>
						</Button>
					) : (
						<Button variant="quiet" size="sm" disabled={busy} onClick={() => onContinue(row.course.map.workspace, row.step)} data-line={lineKey(row)} className={label}>
							<MathLine>{lessonTitle(row)}</MathLine>
						</Button>
					)}
				</Hint>
			))}
		</li>
	);
}
