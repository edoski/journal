import { courseLabel, type ChatListItem } from "@/src/core";
import { localDay } from "@/components/day-change";

/**
 * What he studied today, from the session records (spec: today.md, "A day
 * of study"): every session he worked in whose last turn fell on today's
 * date by the learner's clock, the day ending at midnight (`localDay`, the
 * rule `useDayChange` rereads Home on), oldest first, whatever it stands at
 * now: one he closed, one he ended with Done for today, one still waiting
 * on him. Round 4 found a 40-minute lesson missing because it ended with
 * Done for today. Each is named as the sidebar names it, by its title;
 * a title another session shares ("Review") carries its course too
 * ("Review in Linear Algebra"), the way the sidebar's row carries its
 * course's mark. Pure.
 */
export function doneToday(chats: readonly ChatListItem[], now: Date): string[] {
	const today = localDay(now);
	const name = (chat: ChatListItem) => chat.title.trim().toLowerCase();
	const shared = new Map<string, number>();
	for (const chat of chats) shared.set(name(chat), (shared.get(name(chat)) ?? 0) + 1);
	return chats
		.filter((chat) => chat.messageCount > 0 && localDay(new Date(chat.updatedAt)) === today)
		.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0))
		.map((chat) => (shared.get(name(chat))! > 1 && chat.course ? `${chat.title} in ${courseLabel(chat.course)}` : chat.title));
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
 *  studied something today, "What else are we studying this morning?".
 *  Pure. */
export function dayQuestion(hour: number, studied: boolean): string {
	return `What ${studied ? "else " : ""}are we studying ${partOfDay(hour)}?`;
}

/** The line under the heading that says what he studied today, by name
 *  and never by count: "Studied today: Eigenvalues and eigenvectors, Rank
 *  practice"; null before he has studied anything. "Studied", not "Done":
 *  a lesson he worked in may still wait on him. Pure. */
export function doneWords(done: readonly string[]): string | null {
	return done.length > 0 ? `Studied today: ${done.join(", ")}` : null;
}
