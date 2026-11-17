import type { Why } from "@/components/study-home/agenda-rows/row-facts";
import type { CourseView } from "@/components/course-page/course-model";

/** The step the course's press takes up, in Today's words: what Home's
 *  Today puts first for the course (`whatNext`'s Pick up) when it has a
 *  line here, else Home's line for the course (`courseNext`). Pure. */
export function nextStep(view: CourseView): { title: string; why: Why | null } {
	const line = view.whatNext?.pickUp?.line;
	return line ? { title: line.title, why: line.why } : { title: view.next.lesson.title, why: view.next.why };
}
