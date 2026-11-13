import type { SessionPlan, TopicAttempt } from "@/src/core";
import { planMapSteps, type PlanMapStep } from "@/components/lesson/plan-map";
import { dayWords, type SessionEntry, type TopicAction } from "@/components/unit-inbox/topic-page/topic-facts";

/**
 * What the trail draws (spec: trail.md), pure: the topic's sessions and
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

/** The session whose steps show at first: the one the page's action opens. */
export function opensAtFirst(action: TopicAction): string | null {
	return action.kind === "resume" || action.kind === "open" ? action.chat.id : null;
}

/** A lesson's steps in teaching order, marked as the lesson marks them:
 *  the step its newest tagged question was about, the steps earlier ones
 *  were about, the rest not reached. */
export function lessonSteps(plan: SessionPlan): PlanMapStep[] {
	return planMapSteps(plan.tree.nodes, plan.tree.edges, (id) => (id === plan.current ? "current" : plan.visited.includes(id) ? "visited" : "upcoming"));
}
