"use client";

import { CircleCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { SectionBreak } from "@/components/lesson/section-break";
import { LESSON_WORDS } from "@/components/study-words";
import { cn } from "@/lib/utils";
import { focusWhereHeTypes } from "@/components/ui/overlay";

/** Done for today: he stops now, whatever the tutor left open. A clear
 *  outlined button with its icon, so it reads as the one way to stop, its
 *  corners those of the lesson's other buttons, not a pill (Edo, 15 Nov 2026).
 *  `gone` once the lesson is closed for today: it keeps its room in the
 *  bar, unseen and out of reach, so the roadmap beside it stays still
 *  (round 6: the strip jumped 146px). */
export function DoneTonightButton({ onDone, disabled, gone = false }: { onDone: () => void; disabled?: boolean; gone?: boolean }) {
	const button = (
		<Button
			variant="outline"
			size="row"
			data-testid="done-tonight"
			disabled={disabled || gone}
			aria-hidden={gone || undefined}
			tabIndex={gone ? -1 : undefined}
			onClick={onDone}
			className={cn("shrink-0 px-3 font-normal has-[>svg]:px-3", gone && "invisible")}
		>
			<CircleCheckIcon />
			{LESSON_WORDS.doneTonight}
		</Button>
	);
	return gone ? (
		button
	) : (
		<Hint label="Stop here for today" action="done-tonight" side="bottom">
			{button}
		</Hint>
	);
}

/** Where he pressed Done for today, in the transcript. */
export function DoneTonightLine() {
	return <SectionBreak testId="done-tonight-line" label={LESSON_WORDS.doneTonight} />;
}

/** Whether Done for today is out of sight: the lesson is closed for today
 *  with nothing open in it, or its course or the lesson itself was deleted,
 *  where there is nothing left to stop (round 8: a deleted course's lesson
 *  kept a greyed-out Done for today). A question or problem open after an
 *  earlier close, as the one he left is when he comes back, can be stopped
 *  again (round 14, 2 56: a live question with no Done and a dead ⌘⇧D).
 *  A session the tutor ended (`finished`: a review that closed itself) has
 *  nothing left to stop either (round 14, m32). */
export function doneTonightGone({ closedForToday, open = false, finished = false, courseGone, lessonGone }: { closedForToday: boolean; open?: boolean; finished?: boolean; courseGone: boolean; lessonGone: boolean }): boolean {
	return ((closedForToday || finished) && !open) || courseGone || lessonGone;
}

/** Where his keys go once Done for today has settled: the composer, which
 *  holds the half answer he left, when focus fell to the page as the
 *  question's box gave way or the button went out of reach (round 12,
 *  1 m9). Focus he put somewhere himself stays. */
export function focusAfterDone(doc: Document | undefined, done: boolean, settled: boolean): void {
	if (done && settled) focusWhereHeTypes(doc);
}
