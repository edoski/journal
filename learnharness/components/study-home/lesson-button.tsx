import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Lesson } from "@/components/study-home/lesson-facts";

/** The control that opens a lesson: a link to the session that waits, or a
 *  button that takes up the course's next step. It takes the shadcn
 *  button's own props for its look. */
export function LessonButton({
	lesson,
	busy,
	onContinue,
	children,
	...button
}: Omit<React.ComponentProps<typeof Button>, "asChild" | "onClick" | "disabled"> & {
	lesson: Lesson;
	busy: boolean;
	onContinue: (workspace: string) => void;
}) {
	if (lesson.open.kind === "session") {
		return (
			<Button asChild {...button}>
				<Link href={lesson.open.href} aria-disabled={busy || undefined}>
					{children}
				</Link>
			</Button>
		);
	}
	const { workspace } = lesson.open;
	return (
		<Button disabled={busy} onClick={() => onContinue(workspace)} {...button}>
			{children}
		</Button>
	);
}
