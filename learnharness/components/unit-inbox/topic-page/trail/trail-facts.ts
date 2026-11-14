import type { TopicAttempt } from "@/src/core";
import { dayWords, type SessionEntry } from "@/components/unit-inbox/topic-page/topic-facts";

/**
 * The topic's history by day (Pick up's Earlier), pure: the topic's sessions and
 * the engine's scored attempts on it, placed by day on one line, newest
 * first. A session and an attempt on the same day sit together; nothing
 * says one came from the other.
 */

/** One day of the line: its words, then its sessions, then its attempts. */
export interface TrailDay {
	/** YYYY-MM-DD: a session's last message, or the engine's study day of an attempt. */
	day: string;
	/** "Today", "Yesterday", "Tue 3 Nov". */
	label: string;
	/** Newest first, by last message. */
	sessions: SessionEntry[];
	/** Newest first, by when the engine recorded them. */
	attempts: TopicAttempt[];
}

const newestFirst = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
const byId = new Intl.Collator("en", { numeric: true });

/** One entry per day that has a session or an attempt, newest day first. */
export function trailDays(sessions: readonly SessionEntry[], attempts: readonly TopicAttempt[], today: string): TrailDay[] {
	const days = new Map<string, TrailDay>();
	const dayOf = (day: string) => {
		let found = days.get(day);
		if (!found) days.set(day, (found = { day, label: dayWords(day, today), sessions: [], attempts: [] }));
		return found;
	};
	for (const entry of sessions) dayOf(entry.day).sessions.push(entry);
	for (const attempt of attempts) dayOf(attempt.date).attempts.push(attempt);
	for (const day of days.values()) {
		day.sessions.sort((a, b) => newestFirst(a.chat.updatedAt, b.chat.updatedAt));
		day.attempts.sort((a, b) => newestFirst(a.recorded ?? "", b.recorded ?? "") || byId.compare(b.id, a.id));
	}
	return [...days.values()].sort((a, b) => newestFirst(a.day, b.day));
}
