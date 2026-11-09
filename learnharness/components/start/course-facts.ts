import { courseLabel, type CourseSummary } from "@/src/core";

/** The opening a Today action sends. Open-ended on purpose: the doctrine
 *  answers "continue" with today's reviews first, then the open task at
 *  its step, else the current path topic (`waitingOf` words the same
 *  order), and the prober routes it to teaching or practice. */
export const CONTINUE_OPENING = "Let's continue";

/** One thing a course has waiting, in the engine's own words. */
export type Step =
	/** Today's reviews: the topics' titles, most overdue first, the gap the
	 *  engine noted on the first, and how many are due in all. */
	| { kind: "review"; topics: readonly string[]; due: number; gap: string | null }
	/** The open task, at its step when it has one. */
	| { kind: "task"; title: string; step: string | null }
	/** The current path topic. */
	| { kind: "topic"; title: string };

/** What one course has waiting on Today. */
export interface Waiting {
	workspace: string;
	course: string;
	/** "Exam in 21 days"; null with no exam ahead. */
	exam: string | null;
	/** In the order an open-ended start takes them: reviews, then the open
	 *  task, else the current topic. Empty when nothing is waiting. */
	steps: readonly Step[];
}

/** "Exam in 21 days", "Exam tomorrow", "Exam today"; null with no exam
 *  ahead. Pure. */
export function examText(exam: CourseSummary["exam"]): string | null {
	if (!exam || exam.daysLeft < 0) return null;
	if (exam.daysLeft === 0) return "Exam today";
	if (exam.daysLeft === 1) return "Exam tomorrow";
	return `Exam in ${exam.daysLeft} days`;
}

/** One course's waiting work, read straight from `plan`'s fields. The
 *  engine's `overdue` counts order the reviews; nothing here judges
 *  standing. Pure. */
export function waitingOf(c: CourseSummary): Waiting {
	const steps: Step[] = [];
	if (c.reviews.length > 0) {
		const reviews = [...c.reviews].sort((a, b) => b.overdue - a.overdue);
		steps.push({ kind: "review", topics: reviews.map((r) => r.title), due: Math.max(c.due, reviews.length), gap: reviews[0]!.gap });
	}
	if (c.task) steps.push({ kind: "task", title: c.task, step: c.step });
	else if (c.currentTitle) steps.push({ kind: "topic", title: c.currentTitle });
	return { workspace: c.workspace, course: courseLabel(c), exam: examText(c.exam), steps };
}

/**
 * The app's one cross-course ordering rule: the nearest exam first, then
 * the most recent activity, then the engine's listing order. TEMPORARY:
 * it moves into the engine once its brief names the day's course; no other
 * app-side priority exists. Pure.
 */
export function byPriority(courses: readonly CourseSummary[]): CourseSummary[] {
	const examDays = (c: CourseSummary) => (c.exam && c.exam.daysLeft >= 0 ? c.exam.daysLeft : Infinity);
	const idleDays = (c: CourseSummary) => c.lastActiveDaysAgo ?? Infinity;
	return courses
		.map((course, index) => ({ course, index }))
		.sort((a, b) => examDays(a.course) - examDays(b.course) || idleDays(a.course) - idleDays(b.course) || a.index - b.index)
		.map(({ course }) => course);
}

/** "Span", "Span and Rank", "Span, Rank and more": at most two titles,
 *  never a count. Pure. */
export function topicList(topics: readonly string[], due: number): string {
	const [first, second] = topics;
	if (second === undefined) return first ?? "";
	return due > 2 ? `${first}, ${second} and more` : `${first} and ${second}`;
}

/** A step as a request in the learner's voice: "Review Span and Rank",
 *  "Continue Problem sheet 4", "Continue Rank and the column space". Pure. */
export function stepRequest(step: Step): string {
	switch (step.kind) {
		case "review":
			return `Review ${topicList(step.topics, step.due)}`;
		case "task":
			return `Continue ${step.title}`;
		case "topic":
			return `Continue ${step.title}`;
	}
}

/** A sentence ending in one full stop, whatever the engine's text ends with. Pure. */
export function sentence(text: string): string {
	const trimmed = text.trim();
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
