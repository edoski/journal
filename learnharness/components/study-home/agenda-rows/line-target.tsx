import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { TodayRow } from "@/components/study-home/study-facts";

/** A whole line of Today as one control: a link to the session that waits,
 *  or a button that takes up the course's next step. It takes the shadcn
 *  button's own props for its look. */
export function LineTarget({
	row,
	busy,
	onContinue,
	children,
	...button
}: Omit<React.ComponentProps<typeof Button>, "asChild" | "onClick" | "disabled"> & {
	row: TodayRow;
	busy: boolean;
	onContinue: (workspace: string) => void;
}) {
	if (row.kind === "session") {
		return (
			<Button variant="quiet" asChild {...button}>
				<Link href={`/chat/${row.chat.id}`} aria-disabled={busy || undefined}>
					{children}
				</Link>
			</Button>
		);
	}
	const { workspace } = row.course.map;
	return (
		<Button variant="quiet" disabled={busy} onClick={() => onContinue(workspace)} {...button}>
			{children}
		</Button>
	);
}
