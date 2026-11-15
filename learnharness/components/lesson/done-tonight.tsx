"use client";

import { CircleCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { SectionBreak } from "@/components/lesson/section-break";
import { LESSON_WORDS } from "@/components/study-words";
import { cn } from "@/lib/utils";

/** Done for today: he stops now, whatever the tutor left open. A clear
 *  outlined button with its icon, so it reads as the one way to stop.
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
			className={cn("shrink-0 rounded-full px-3 font-normal has-[>svg]:px-3", gone && "invisible")}
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
