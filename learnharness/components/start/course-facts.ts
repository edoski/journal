import type { CourseSummary } from "@/src/core";
import { shortDay } from "@/components/study-words";

/** The opening a Continue sends. Open-ended on purpose: the doctrine
 *  answers "continue" with today's reviews first, then the open task at
 *  its step, else the current path topic, and the prober routes it to
 *  teaching or practice. */
export const CONTINUE_OPENING = "Let's continue";

/** "Exam 3 Dec", "Exam tomorrow", "Exam today"; null with no exam
 *  ahead. The day itself, never a count of days (round 14, m9: "Exam in 11
 *  days"). Pure. */
export function examText(exam: CourseSummary["exam"]): string | null {
	if (!exam || exam.daysLeft < 0) return null;
	if (exam.daysLeft === 0) return "Exam today";
	if (exam.daysLeft === 1) return "Exam tomorrow";
	return `Exam ${shortDay(exam.date)}`;
}
