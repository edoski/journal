"use client";

import { CircleCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { SectionBreak } from "@/components/lesson/section-break";
import { LESSON_WORDS } from "@/components/study-words";

/** Done for today: he stops now, whatever the tutor left open. A clear
 *  outlined button with its icon, so it reads as the one way to stop. */
export function DoneTonightButton({ onDone, disabled }: { onDone: () => void; disabled?: boolean }) {
	return (
		<Hint label="Stop here for today" action="done-tonight" side="bottom">
			<Button
				variant="outline"
				size="row"
				data-testid="done-tonight"
				disabled={disabled}
				onClick={onDone}
				className="shrink-0 rounded-full px-3 font-normal has-[>svg]:px-3"
			>
				<CircleCheckIcon />
				{LESSON_WORDS.doneTonight}
			</Button>
		</Hint>
	);
}

/** Where he pressed Done for today, in the transcript. */
export function DoneTonightLine() {
	return <SectionBreak testId="done-tonight-line" label={LESSON_WORDS.doneTonight} />;
}
