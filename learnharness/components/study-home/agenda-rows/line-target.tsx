import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { StudyCourse } from "@/src/core";
import type { NextStep, TodayRow } from "@/components/study-home/study-facts";
import { lineKey } from "@/components/study-home/agenda-rows/row-facts";
import { continueHref } from "@/components/nav/session-state";
import type { TakeLine } from "@/components/start/use-lesson-start";

/** What a line of Today does, pressed, wherever it is drawn (Home's rows and
 *  its Also line, the course page's Now, the sidebar's card): it opens the
 *  session that waits (`href`), else takes up its course's `step`,
 *  which the page takes through `courseMove`: the session that holds it,
 *  else a lesson started on it. Pure. */
export function linePress(row: TodayRow): { href: string } | { course: StudyCourse; step: NextStep } {
	return row.kind === "session" ? { href: continueHref(row.chat) } : { course: row.course, step: row.step };
}

/** A whole line of Today as one control, doing what the line does
 *  (`linePress`): a link to the session that waits, or a button that takes
 *  up the line's step, marked with its line's key (`data-line`) for Home's
 *  keys. It takes the shadcn button's own props for its look. */
export function LineTarget({
	row,
	busy,
	onContinue,
	children,
	...button
}: Omit<React.ComponentProps<typeof Button>, "asChild" | "onClick" | "disabled"> & {
	row: TodayRow;
	busy: boolean;
	onContinue: TakeLine;
}) {
	const press = linePress(row);
	if ("href" in press) {
		return (
			<Button variant="quiet" asChild data-line={lineKey(row)} {...button}>
				<Link href={press.href} aria-disabled={busy || undefined}>
					{children}
				</Link>
			</Button>
		);
	}
	return (
		<Button variant="quiet" disabled={busy} onClick={() => onContinue(press.course.map.workspace, press.step)} data-line={lineKey(row)} {...button}>
			{children}
		</Button>
	);
}
