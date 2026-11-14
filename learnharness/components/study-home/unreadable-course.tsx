import type { UnreadableCourse, UnreadableProblem } from "@/src/core";
import { LESSON_WORDS } from "@/components/study-words";

/** What stops a course's record being read, in a student's words. */
const PROBLEM_WORDS: Record<UnreadableProblem, string> = {
	denied: "The app isn't allowed to open its files.",
	damaged: "Its file is damaged.",
	unreadable: "Its file can't be opened.",
};

/** The one line for a course whose record can't be read, wherever it
 *  shows: Home and the course page. Pure. */
export function unreadableLine(problem: UnreadableProblem): string {
	return `${LESSON_WORDS.unreadableCourse}. ${PROBLEM_WORDS[problem]}`;
}

/** Home's lines under Today (spec: lessons.md), one per course whose
 *  record can't be read: its name, then the line. */
export function UnreadableLines({ courses }: { courses: readonly UnreadableCourse[] }) {
	return courses.map((course) => (
		<p key={course.workspace} data-slot="unreadable-course" className="shrink-0 text-row text-muted-foreground">
			<span className="text-foreground">{course.title}</span> {unreadableLine(course.problem)}
		</p>
	));
}
