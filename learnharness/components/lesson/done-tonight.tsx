"use client";

import { Button } from "@/components/ui/button";
import { SectionBreak } from "@/components/lesson/section-break";
import { LESSON_WORDS } from "@/components/study-words";

/** Done for tonight: he stops now, whatever the tutor left open. */
export function DoneTonightButton({ onDone, disabled }: { onDone: () => void; disabled?: boolean }) {
	return (
		<Button variant="quiet" size="sm" data-testid="done-tonight" disabled={disabled} onClick={onDone} className="h-8 px-2 text-row font-normal">
			{LESSON_WORDS.doneTonight}
		</Button>
	);
}

/** Where he pressed Done for tonight, in the transcript. */
export function DoneTonightLine() {
	return <SectionBreak testId="done-tonight-line" label={LESSON_WORDS.doneTonight} />;
}
