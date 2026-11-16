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

/** One row of the line: a session, or an attempt. An attempt on the same
 *  question as the row above it reads "First try" (its oldest) or "Then"
 *  in place of the question (`title`), so a practice problem's two tries
 *  never print the whole statement twice (round 8). */
export type TrailRow = { kind: "session"; entry: SessionEntry } | { kind: "attempt"; attempt: TopicAttempt; title?: string };

/** The words a repeated question's older tries read in place of it, as
 *  the answer card names them. */
export const TRY_WORDS = { first: "First try", then: "Then" } as const;

/** One day of the line: its words, then its rows. */
export interface TrailDay {
	/** YYYY-MM-DD: the engine's study day of a session's newest answer
	 *  (its last message when it saved none), or of an attempt. */
	day: string;
	/** "Today", "Yesterday", "Tue 3 Nov". */
	label: string;
	/** The attempts of no listed session, newest first; then each session,
	 *  newest first by its newest answer (its last message when it saved
	 *  none), followed by its own attempts, newest first. A session's
	 *  attempts sit under it on its day. */
	rows: TrailRow[];
}

const newestFirst = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
const byId = new Intl.Collator("en", { numeric: true });
const byRecorded = (a: TopicAttempt, b: TopicAttempt) => newestFirst(a.recorded ?? "", b.recorded ?? "") || byId.compare(b.id, a.id);
const attemptRow = (attempt: TopicAttempt): TrailRow => ({ kind: "attempt", attempt });

/** A question's words, for telling the same one asked again. */
const questionKey = (attempt: TopicAttempt) => attempt.text.trim().replace(/\s+/g, " ");

/** Attempts newest first as rows: in a run on the same question, the
 *  newest keeps it, the oldest reads "First try" and any between "Then". */
function retitled(attempts: readonly TopicAttempt[]): TrailRow[] {
	return attempts.map((attempt, i) => {
		const key = questionKey(attempt);
		if (i === 0 || questionKey(attempts[i - 1]!) !== key) return attemptRow(attempt);
		const oldest = i === attempts.length - 1 || questionKey(attempts[i + 1]!) !== key;
		return { kind: "attempt", attempt, title: oldest ? TRY_WORDS.first : TRY_WORDS.then };
	});
}

/** The sessions Earlier lists: every one but those Now and Next hold,
 *  which keep their line here when they saved answers on the topic, so
 *  each answer sits under its own session's line (round 13, 2 n2: Problem
 *  sheet 4, Kernel's Now, left its answer with no line, on top of the
 *  morning review's). Pure. */
export function earlierSessions(sessions: readonly SessionEntry[], held: ReadonlySet<string | null>, attempts: readonly TopicAttempt[]): SessionEntry[] {
	return sessions.filter((entry) => !held.has(entry.chat.id) || attempts.some((attempt) => attempt.session === entry.chat.id));
}

/** One entry per day that has a session or an attempt, newest day first. */
export function trailDays(sessions: readonly SessionEntry[], attempts: readonly TopicAttempt[], today: string): TrailDay[] {
	const listed = new Set(sessions.map((entry) => entry.chat.id));
	const days = new Map<string, { loose: TopicAttempt[]; sessions: SessionEntry[] }>();
	const dayOf = (day: string) => {
		let found = days.get(day);
		if (!found) days.set(day, (found = { loose: [], sessions: [] }));
		return found;
	};
	const saved = (entry: SessionEntry) => attempts.filter((attempt) => attempt.session === entry.chat.id).sort(byRecorded);
	// A session sits on the day of its newest answer on the topic, never its last message (round 12, 1 m12: an Ask on
	// 17 Nov in the 8 Nov lesson's chat put the lesson's answers under Today, above the 9 Nov review's).
	const newest = (entry: SessionEntry) => saved(entry)[0];
	for (const entry of sessions) dayOf(newest(entry)?.date ?? entry.day).sessions.push(entry);
	for (const attempt of attempts) if (!attempt.session || !listed.has(attempt.session)) dayOf(attempt.date).loose.push(attempt);
	const latest = (entry: SessionEntry) => newest(entry)?.recorded ?? entry.chat.updatedAt;
	return [...days.entries()]
		.sort(([a], [b]) => newestFirst(a, b))
		.map(([day, found]) => ({
			day,
			label: dayWords(day, today),
			rows: [
				...retitled(found.loose.sort(byRecorded)),
				...found.sessions.sort((a, b) => newestFirst(latest(a), latest(b))).flatMap((entry): TrailRow[] => [{ kind: "session", entry }, ...retitled(saved(entry))]),
			],
		}));
}
