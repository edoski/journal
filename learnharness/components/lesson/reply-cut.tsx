"use client";

import { Button } from "@/components/ui/button";
import { LESSON_WORDS } from "@/components/study-words";

/** The tutor's turn ended with no reply (src/core/turn-cut.ts): one plain
 *  line where the reply would be, saying so when he stopped it himself,
 *  and Try again, which runs the turn on what he already sent. */
export function ReplyCut({ byYou = false, onRetry }: { byYou?: boolean; onRetry: () => void }) {
	return (
		<div role="status" data-testid="reply-cut" className="flex flex-wrap items-center gap-1 text-row">
			<span className="mr-2 min-w-0 text-muted-foreground">{byYou ? LESSON_WORDS.youStoppedReply : LESSON_WORDS.stoppedBeforeReply}</span>
			<Button variant="quiet" size="sm" data-testid="reply-cut-retry" onClick={onRetry} className="h-8 px-2 text-row font-medium text-foreground">
				{LESSON_WORDS.tryAgain}
			</Button>
		</div>
	);
}
