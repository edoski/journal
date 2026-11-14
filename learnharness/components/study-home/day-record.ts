import type { ChatListItem } from "@/src/core";
import { localDay } from "@/components/day-change";
import { sessionState } from "@/components/nav/session-state";

/**
 * What he finished today, from the session records (spec: today.md, "A
 * day of study"): each session the tutor closed (a lesson, a practice
 * round, an answer) whose last turn fell on today's date by the learner's
 * clock, the day ending at midnight (`localDay`, the rule `useDayChange`
 * rereads Home on), oldest first, by title. A session still waiting on
 * him, or stopped mid-reply, is not done. Pure.
 */
export function doneToday(chats: readonly ChatListItem[], now: Date): string[] {
	const today = localDay(now);
	return chats
		.filter((chat) => chat.messageCount > 0 && chat.ended === "closed" && sessionState(chat) === "finished" && localDay(new Date(chat.updatedAt)) === today)
		.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0))
		.map((chat) => chat.title);
}

/** The part of the learner's day an hour falls in, in words: "this
 *  morning", "this afternoon", "this evening", else "today" (he studies in
 *  the daytime; never "tonight"). Pure. */
function partOfDay(hour: number): string {
	if (hour >= 5 && hour < 12) return "this morning";
	if (hour >= 12 && hour < 18) return "this afternoon";
	if (hour >= 18 && hour < 22) return "this evening";
	return "today";
}

/** Home's heading, one question for the hour (Edo, 13 Nov 2026: dynamic,
 *  never the date): "What are we studying this morning?", or once he has
 *  finished something today, "What else are we studying this morning?".
 *  Pure. */
export function dayQuestion(hour: number, studied: boolean): string {
	return `What ${studied ? "else " : ""}are we studying ${partOfDay(hour)}?`;
}

/** The line under the heading that says what he finished today, by name
 *  and never by count: "Done today: Eigenvalues and eigenvectors, Rank
 *  practice"; null before he has finished anything. Pure. */
export function doneWords(done: readonly string[]): string | null {
	return done.length > 0 ? `Done today: ${done.join(", ")}` : null;
}
