import type { CourseSummary } from "@/src/core";
import { byPriority, stepRequest, waitingOf } from "@/components/start/course-facts";

/** A request Today offers to put in the composer. */
export interface Suggestion {
	workspace: string;
	/** "Review Linear independence, Span and more": the composer's text. */
	request: string;
	/** The course, shown only when the suggestions span more than one. */
	course: string | null;
}

export const SUGGESTION_LIMIT = 3;

/** At most three requests: each course's first step in `byPriority`
 *  order, then each one's second step. Pure. */
export function suggestions(courses: readonly CourseSummary[]): Suggestion[] {
	const waiting = byPriority(courses).map(waitingOf);
	const rounds = Math.max(0, ...waiting.map((w) => w.steps.length));
	const picked = Array.from({ length: rounds }, (_, round) =>
		waiting.flatMap((w) => {
			const step = w.steps[round];
			return step ? [{ workspace: w.workspace, course: w.course, request: stepRequest(step) }] : [];
		}),
	)
		.flat()
		.slice(0, SUGGESTION_LIMIT);
	const several = new Set(picked.map((p) => p.workspace)).size > 1;
	return picked.map((p) => ({ workspace: p.workspace, request: p.request, course: several ? p.course : null }));
}
