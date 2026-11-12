"use client";

import Link from "next/link";
import { courseLabel } from "@/src/core";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DayHeading } from "@/components/study-home/day-heading";
import { stepWords, type TodayRow } from "@/components/study-home/study-facts";

/** At most this many lines; past it the last line names the other courses. */
const MAX_LINES = 5;

/** Every column of a line, the same on every line, so the course, the
 *  lesson and the action read down the list. */
const LINE =
	"-mx-3 grid h-13 w-[calc(100%+1.5rem)] grid-cols-[9rem_minmax(0,1fr)_5.5rem] items-center justify-items-start gap-x-6 rounded-lg px-3 text-left font-normal whitespace-normal";

/**
 * Today (spec: today.md): the page's title, then one line per course, each
 * its course and its one next lesson. The first line holds the page's only
 * primary action.
 */
export function Today({
	rows,
	today,
	busy,
	onContinue,
}: {
	rows: readonly TodayRow[];
	/** The engine's study day. */
	today: string;
	busy: boolean;
	onContinue: (workspace: string) => void;
}) {
	const shown = rows.length > MAX_LINES ? rows.slice(0, MAX_LINES - 1) : rows;
	const also = rows.slice(shown.length);
	return (
		<section aria-labelledby="today-heading" data-slot="today" className="flex shrink-0 flex-col gap-2">
			<DayHeading id="today-heading" today={today} />
			<ul className="flex flex-col">
				{shown.map((row, i) => (
					<li key={row.kind === "session" ? row.chat.id : row.course.map.workspace}>
						<TodayLine row={row} primary={i === 0} busy={busy} onContinue={onContinue} />
					</li>
				))}
				{also.length > 0 && (
					<li data-slot="today-also" className="flex h-13 items-center gap-1 text-row text-muted-foreground">
						Also today:
						{also.map((row) =>
							row.kind === "session" ? (
								<Button key={row.chat.id} variant="quiet" size="sm" asChild className="text-row font-normal text-foreground">
									<Link href={`/chat/${row.chat.id}`}>{row.course ? row.course.map.title : row.chat.title}</Link>
								</Button>
							) : (
								<Button
									key={row.course.map.workspace}
									variant="quiet"
									size="sm"
									disabled={busy}
									onClick={() => onContinue(row.course.map.workspace)}
									className="text-row font-normal text-foreground"
								>
									{row.course.map.title}
								</Button>
							),
						)}
					</li>
				)}
			</ul>
		</section>
	);
}

/** One line: the course, the lesson in words, and on the first line the
 *  action. The whole line opens the lesson. */
function TodayLine({ row, primary, busy, onContinue }: { row: TodayRow; primary: boolean; busy: boolean; onContinue: (workspace: string) => void }) {
	const course = row.course;
	const cells = (
		<>
			<span className="w-full truncate text-row text-foreground">{course ? course.map.title : row.kind === "session" && row.chat.course ? courseLabel(row.chat.course) : "No course"}</span>
			<span className="w-full truncate text-row font-medium text-foreground">{row.kind === "session" ? row.chat.title : stepWords(row.step)}</span>
			<span className="justify-self-end">
				{primary && (
					<span aria-hidden="true" className={cn(buttonVariants({ size: "sm" }), "font-normal")}>
						{row.kind === "session" ? "Open" : "Continue"}
					</span>
				)}
			</span>
		</>
	);
	if (row.kind === "session") {
		return (
			<Button variant="quiet" asChild data-slot="today-line" data-primary={primary || undefined} className={LINE}>
				<Link href={`/chat/${row.chat.id}`} aria-disabled={busy || undefined}>
					{cells}
				</Link>
			</Button>
		);
	}
	return (
		<Button
			variant="quiet"
			data-slot="today-line"
			data-primary={primary || undefined}
			disabled={busy}
			onClick={() => onContinue(row.course.map.workspace)}
			className={LINE}
		>
			{cells}
		</Button>
	);
}
