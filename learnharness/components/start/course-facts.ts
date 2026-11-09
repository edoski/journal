import { courseLabel, type CourseSummary } from "@/src/core";

/** What Today shows for one course, read straight from the engine's `plan`
 *  fields: counts and dates the engine computed, never a standing. */
export interface CourseLine {
	workspace: string;
	title: string;
	/** "Exam in 21 days", "Exam tomorrow", "Exam today"; null with no exam ahead. */
	exam: string | null;
	/** "6 reviews due, most overdue: Linear independence"; null when none is due. */
	reviews: string | null;
	/** The open task's step, or its title when it has no step. */
	next: string | null;
	/** Review starts a practice session on the due topics. */
	review: { opening: string } | null;
	/** Continue starts a teaching session at the open task or current topic. */
	continue: { opening: string; hint: string } | null;
}

function examText(exam: CourseSummary["exam"]): string | null {
	if (!exam || exam.daysLeft < 0) return null;
	if (exam.daysLeft === 0) return "Exam today";
	if (exam.daysLeft === 1) return "Exam tomorrow";
	return `Exam in ${exam.daysLeft} days`;
}

function reviewsText(c: CourseSummary): string | null {
	if (c.due <= 0) return null;
	const count = `${c.due} ${c.due === 1 ? "review" : "reviews"} due`;
	if (!c.mostOverdue) return count;
	return c.due === 1 ? `${count}: ${c.mostOverdue}` : `${count}, most overdue: ${c.mostOverdue}`;
}

/** One course as a Today line, with the openings Review and Continue send.
 *  Pure. */
export function courseLine(c: CourseSummary): CourseLine {
	const title = courseLabel(c);
	return {
		workspace: c.workspace,
		title,
		exam: examText(c.exam),
		reviews: reviewsText(c),
		next: c.step ?? c.task,
		review: c.due > 0 ? { opening: "Review what's due" } : null,
		continue: c.task
			? { opening: `Continue ${c.task}`, hint: c.step ? `${c.task}: ${c.step}` : c.task }
			: c.current
				? { opening: "Continue where I left off", hint: `Continue ${title}` }
				: null,
	};
}
