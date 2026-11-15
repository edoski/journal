import type { UnreadableCourse, UnreadableProblem } from "@/src/core";
import { LESSON_WORDS, UNREADABLE_WORDS } from "@/components/study-words";

/** The one line for a course whose record can't be read, wherever it
 *  shows: Home and the course page. Pure. */
export function unreadableLine(problem: UnreadableProblem): string {
	return `${LESSON_WORDS.unreadableCourse}. ${UNREADABLE_WORDS[problem]}`;
}

/** Home's lines under Today (spec: lessons.md), one per course whose
 *  record can't be read: its name, then the line. */
export function UnreadableLines({ courses }: { courses: readonly UnreadableCourse[] }) {
	return courses.map((course) => (
		<p key={course.workspace} data-slot="unreadable-course" className="shrink-0 text-body system-current:text-row text-muted-foreground">
			<span className="text-foreground">{course.title}</span> {unreadableLine(course.problem)}
		</p>
	));
}
