import { courseLabel, type CourseSummary } from "@/src/core";

/** The opening a course chip sends. Open-ended on purpose: the doctrine
 *  answers "continue" with today's review first, then the open task at its
 *  step, else the current path topic; the course brief carries all three. */
export const CHIP_OPENING = "Let's continue";

/** What Today shows for one course, read straight from the engine's `plan`
 *  fields: counts the engine computed, never a standing. */
export interface CourseChip {
	workspace: string;
	title: string;
	/** "6 due"; null when nothing is due. */
	due: string | null;
	/** The tooltip: what the session will take up ("6 reviews due, then
	 *  Problem sheet 4: Part (c)"); null with nothing due and no task. */
	hint: string | null;
}

/** "Exam in 21 days", "Exam tomorrow", "Exam today"; null with no exam
 *  ahead. Pure. */
export function examText(exam: CourseSummary["exam"]): string | null {
	if (!exam || exam.daysLeft < 0) return null;
	if (exam.daysLeft === 0) return "Exam today";
	if (exam.daysLeft === 1) return "Exam tomorrow";
	return `Exam in ${exam.daysLeft} days`;
}

/** One course as a Today chip. Pure. */
export function courseChip(c: CourseSummary): CourseChip {
	const reviews = c.due > 0 ? `${c.due} ${c.due === 1 ? "review" : "reviews"} due` : null;
	const task = c.task ? (c.step ? `${c.task}: ${c.step}` : c.task) : null;
	return {
		workspace: c.workspace,
		title: courseLabel(c),
		due: c.due > 0 ? `${c.due} due` : null,
		hint: reviews && task ? `${reviews}, then ${task}` : reviews ?? task,
	};
}
