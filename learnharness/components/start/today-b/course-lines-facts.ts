import type { CourseSummary } from "@/src/core";
import { byPriority, stepRequest, waitingOf } from "@/components/start/course-facts";

/** One course on Today: its title, the exam, and one sentence saying what is next. */
export interface CourseLine {
	workspace: string;
	course: string;
	/** "Exam in 21 days"; null with no exam ahead. */
	exam: string | null;
	/** "Review Span, Rank and more, then continue Problem sheet 4." */
	next: string;
}

/** One line per course, in `byPriority` order; a course with nothing
 *  waiting says so. Pure. */
export function courseLines(courses: readonly CourseSummary[]): CourseLine[] {
	return byPriority(courses).map((course) => {
		const { workspace, course: title, exam, steps } = waitingOf(course);
		const [first, then] = steps.map(stepRequest);
		// Every request opens with this module's own verb, so lowering its first letter never touches a title.
		const next = first ? `${first}${then ? `, then ${then.charAt(0).toLowerCase()}${then.slice(1)}` : ""}.` : "Nothing waiting.";
		return { workspace, course: title, exam, next };
	});
}
