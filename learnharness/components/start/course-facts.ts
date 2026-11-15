import type { CourseSummary } from "@/src/core";

/** The opening a Continue sends. Open-ended on purpose: the doctrine
 *  answers "continue" with today's reviews first, then the open task at
 *  its step, else the current path topic, and the prober routes it to
 *  teaching or practice. */
export const CONTINUE_OPENING = "Let's continue";

/** "Exam in 21 days", "Exam tomorrow", "Exam today"; null with no exam
 *  ahead. Pure. */
export function examText(exam: CourseSummary["exam"]): string | null {
	if (!exam || exam.daysLeft < 0) return null;
	if (exam.daysLeft === 0) return "Exam today";
	if (exam.daysLeft === 1) return "Exam tomorrow";
	return `Exam in ${exam.daysLeft} days`;
}
