import type { TopicAttempt } from "@/src/core";
import { dayWords, type SessionEntry } from "@/components/unit-inbox/topic-page/topic-facts";

/**
 * The topic's history by day (Pick up's Earlier), pure: the topic's
 * sessions and the engine's scored attempts on it, newest day first. Each
 * session is followed by the attempts it saved (`TopicAttempt.session`);
 * an attempt whose session is not listed here (it is Now or Next, or the
 * read could not tell) comes first in its day, before any session, so no
 * attempt reads as the session's above it (round 7: the Eigen lesson's
 * answers sat under "Rank practice").
 */

/** One row of the line: a session, or an attempt. */
export type TrailRow = { kind: "session"; entry: SessionEntry } | { kind: "attempt"; attempt: TopicAttempt };

/** One day of the line: its words, then its rows. */
export interface TrailDay {
	/** YYYY-MM-DD: a session's last message, or the engine's study day of an attempt. */
	day: string;
	/** "Today", "Yesterday", "Tue 3 Nov". */
	label: string;
	/** The attempts of no listed session, newest first; then each session,
	 *  newest first by last message, followed by its own attempts, newest
	 *  first. A session's attempts sit under it on its day. */
	rows: TrailRow[];
}

const newestFirst = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
const byId = new Intl.Collator("en", { numeric: true });
const byRecorded = (a: TopicAttempt, b: TopicAttempt) => newestFirst(a.recorded ?? "", b.recorded ?? "") || byId.compare(b.id, a.id);
const attemptRow = (attempt: TopicAttempt): TrailRow => ({ kind: "attempt", attempt });

/** One entry per day that has a session or an attempt, newest day first. */
export function trailDays(sessions: readonly SessionEntry[], attempts: readonly TopicAttempt[], today: string): TrailDay[] {
	const listed = new Set(sessions.map((entry) => entry.chat.id));
	const days = new Map<string, { loose: TopicAttempt[]; sessions: SessionEntry[] }>();
	const dayOf = (day: string) => {
		let found = days.get(day);
		if (!found) days.set(day, (found = { loose: [], sessions: [] }));
		return found;
	};
	for (const entry of sessions) dayOf(entry.day).sessions.push(entry);
	for (const attempt of attempts) if (!attempt.session || !listed.has(attempt.session)) dayOf(attempt.date).loose.push(attempt);
	const saved = (entry: SessionEntry) => attempts.filter((attempt) => attempt.session === entry.chat.id).sort(byRecorded);
	return [...days.entries()]
		.sort(([a], [b]) => newestFirst(a, b))
		.map(([day, found]) => ({
			day,
			label: dayWords(day, today),
			rows: [
				...found.loose.sort(byRecorded).map(attemptRow),
				...found.sessions.sort((a, b) => newestFirst(a.chat.updatedAt, b.chat.updatedAt)).flatMap((entry): TrailRow[] => [{ kind: "session", entry }, ...saved(entry).map(attemptRow)]),
			],
		}));
}
