import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { NextStep, TodayRow } from "@/components/study-home/study-facts";
import { lineKey } from "@/components/study-home/agenda-rows/row-facts";
import { continueHref } from "@/components/nav/session-state";

/** A whole line of Today as one control: a link to the session that waits,
 *  or a button that takes up the line's step, marked with its line's key
 *  (`data-line`) for Home's keys. It takes the shadcn button's own props
 *  for its look. */
export function LineTarget({
	row,
	busy,
	onContinue,
	children,
	...button
}: Omit<React.ComponentProps<typeof Button>, "asChild" | "onClick" | "disabled"> & {
	row: TodayRow;
	busy: boolean;
	onContinue: (workspace: string, step?: NextStep) => void;
}) {
	if (row.kind === "session") {
		return (
			<Button variant="quiet" asChild data-line={lineKey(row)} {...button}>
				<Link href={continueHref(row.chat)} aria-disabled={busy || undefined}>
					{children}
				</Link>
			</Button>
		);
	}
	const { workspace } = row.course.map;
	return (
		<Button variant="quiet" disabled={busy} onClick={() => onContinue(workspace, row.step)} data-line={lineKey(row)} {...button}>
			{children}
		</Button>
	);
}
