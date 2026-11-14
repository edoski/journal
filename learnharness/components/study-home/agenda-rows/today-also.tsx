import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { mathPlain } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";
import { lessonTitle, whyOf } from "@/components/study-home/agenda-rows/row-facts";
import type { TodayRow } from "@/components/study-home/study-facts";

/** What a folded course's button takes up and why, for its tooltip, as a
 *  full line says it: "Review Improper integrals. Back in 3w". Pure. */
export function alsoHint(row: TodayRow): string {
	const why = whyOf(row);
	return `${mathPlain(lessonTitle(row))}${why ? `. ${why.short}` : ""}`;
}

/** Past five courses, the last line: "Also today:" and each further course
 *  as a quiet button that opens its lesson, its tooltip naming the lesson
 *  and why; the label sits as far from the first course as the courses sit
 *  from each other. */
export function TodayAlso({ rows, busy, onContinue, className }: { rows: readonly TodayRow[]; busy: boolean; onContinue: (workspace: string) => void; className?: string }) {
	return (
		<li data-slot="today-also" className={cn("flex h-13 items-center gap-1 text-row text-muted-foreground", className)}>
			<span className="mr-3">Also today:</span>
			{rows.map((row) => (
				<Hint key={row.kind === "session" ? row.chat.id : row.course.map.workspace} label={alsoHint(row)} side="top">
					{row.kind === "session" ? (
						<Button variant="quiet" size="sm" asChild className="text-row font-normal text-foreground">
							<Link href={`/chat/${row.chat.id}`}>{row.course ? row.course.map.title : row.chat.title}</Link>
						</Button>
					) : (
						<Button variant="quiet" size="sm" disabled={busy} onClick={() => onContinue(row.course.map.workspace)} className="text-row font-normal text-foreground">
							{row.course.map.title}
						</Button>
					)}
				</Hint>
			))}
		</li>
	);
}
