"use client";

import { Button } from "@/components/ui/button";
import { LESSON_WORDS } from "@/components/study-words";

/** The tutor's turn ended with no reply (src/core/turn-cut.ts): one plain
 *  line where the reply would be, saying so when he stopped it himself,
 *  before its first word or after the tutor had written, that the tutor
 *  couldn't reply when the turn failed (round 16, m2: a turn refused before
 *  it began read "The tutor stopped before replying"), and Try again, which
 *  runs the turn on what he already sent. A turn refused for a signed-out
 *  Claude says, once Claude reads signed in, that he can send it now
 *  (round 19, m27: it turned into the vaguer "The tutor couldn't reply"). */
export function ReplyCut({ cut, onRetry }: { cut: "stopped" | "stopped-mid" | "lost" | "failed" | "signed-in"; onRetry: () => void }) {
	const words = cut === "stopped-mid" ? LESSON_WORDS.youStoppedMidReply : cut === "stopped" ? LESSON_WORDS.youStoppedReply : cut === "failed" ? LESSON_WORDS.couldntReply : cut === "signed-in" ? LESSON_WORDS.signedInAgain : LESSON_WORDS.stoppedBeforeReply;
	return (
		<div role="status" data-testid="reply-cut" className="flex flex-wrap items-center gap-1 text-body">
			<span className="mr-2 min-w-0 text-muted-foreground">{words}</span>
			<Button variant="quiet" size="sm" data-testid="reply-cut-retry" onClick={onRetry} className="h-8 px-2 text-body text-foreground">
				{LESSON_WORDS.tryAgain}
			</Button>
		</div>
	);
}
