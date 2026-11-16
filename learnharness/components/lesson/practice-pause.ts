import { LESSON_WORDS } from "@/components/study-words";

/** Where a practice session stands for the pause between problems. */
export interface PauseFacts {
	practice: boolean;
	/** Done for today closed it. */
	closed: boolean;
	/** A question or a problem is open. */
	open: boolean;
	busy: boolean;
	/** A problem was ever posed (the fresh session's opening is owed, not the move-on). */
	posed: boolean;
	/** A reply that failed or was cut waits for Try again. */
	retry: boolean;
}

/** THE PRACTICE PAUSE (owner round 16): between problems, Enter on the
 *  empty box and the Next chip ask for the next one. Not while a reply
 *  that failed or was cut waits for Try again: Enter tries it again, and
 *  the box says so (round 14, 4 minor 6: "press Enter for the next one"
 *  under "Sign in, then press Retry"). Pure. */
export function practicePause(f: PauseFacts): boolean {
	return f.practice && !f.closed && !f.open && !f.busy && f.posed && !f.retry;
}

/** What the empty box says between turns: the next problem's Enter, or
 *  Try again's; undefined for the box's own words. */
export function pausePlaceholder(next: boolean, retry: boolean): string | undefined {
	return next ? "Ask anything, or press Enter for the next one." : retry ? LESSON_WORDS.tryAgainPlaceholder : undefined;
}
