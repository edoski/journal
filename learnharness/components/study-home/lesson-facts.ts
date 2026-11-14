import { courseLabel, type CourseMap, type StudyCourse, type TopicHandle } from "@/src/core";
import { runupExam, stepWords, type NextStep, type TodayRow } from "@/components/study-home/study-facts";

/** What a lesson's button does: open the session that waits, or take up the
 *  course's next step. The word names the step. */
export type LessonAction = "Open" | "Review" | "Continue" | "Start";

/**
 * One lesson of Today in plain words, the same for every study home: what
 * it is by name, the course it belongs to, what its second line says and
 * the arc it sits in. Engine fields only.
 */
export interface Lesson {
	key: string;
	kind: "reply" | NextStep["kind"];
	course: StudyCourse | null;
	courseTitle: string;
	/** "Exam in 11 days" while the course is in its run-up, else null. */
	exam: string | null;
	title: string;
	detail: string | null;
	action: LessonAction;
	/** The course topics the lesson works on. */
	topics: readonly TopicHandle[];
	/** The arc every topic of the lesson lies in, by its title (`arcPlace`). */
	place: string | null;
	open: { kind: "session"; href: string } | { kind: "course"; workspace: string };
}

const ACTION: Record<NextStep["kind"], LessonAction> = { review: "Review", task: "Continue", topic: "Continue", none: "Start" };

/** The arc some topics lie in, by its title, when every one of them lies
 *  in the same arc; null when they span arcs (a review mixes arcs by
 *  design), when none is on the map, and in a course without arcs. Pure. */
export function arcPlace(map: Pick<CourseMap, "arcs" | "topics">, topics: readonly TopicHandle[]): string | null {
	if (!map.arcs) return null;
	const wanted = new Set<string>(topics);
	const arcs = new Set(map.topics.filter((t) => wanted.has(t.handle)).map((t) => t.arc));
	const [arc] = arcs;
	if (arcs.size !== 1 || !arc) return null;
	return map.arcs.find((a) => a.handle === arc)?.title ?? null;
}

/** A line of Today as a lesson. A waiting session sits at the course topics
 *  its transcript worked on; a course's step at the topics it takes up.
 *  "Then" is left out when it only repeats a review. Pure. */
export function lessonOf(row: TodayRow): Lesson {
	if (row.kind === "session") {
		const { chat, course } = row;
		const onMap = new Set<string>(course?.map.topics.map((t) => t.handle));
		const topics = (chat.topics ?? []).filter((h): h is TopicHandle => onMap.has(h));
		return {
			key: chat.id,
			kind: "reply",
			course,
			courseTitle: course ? course.map.title : chat.course ? courseLabel(chat.course) : "No course",
			exam: course ? runupExam(course) : null,
			title: chat.title,
			detail: "Waiting for your reply",
			action: "Open",
			topics,
			place: course ? arcPlace(course.map, topics) : null,
			open: { kind: "session", href: `/chat/${chat.id}` },
		};
	}
	const { course, step } = row;
	const reviews = step.kind === "review" ? step.titles : [];
	const then = step.kind === "review" && step.then && !reviews.includes(step.then) ? step.then : null;
	const topics = step.kind === "none" ? [] : step.topics;
	return {
		key: course.map.workspace,
		kind: step.kind,
		course,
		courseTitle: course.map.title,
		exam: runupExam(course),
		title: stepWords(step),
		detail: step.kind === "review" && then ? `Then ${then}` : null,
		action: ACTION[step.kind],
		topics,
		place: arcPlace(course.map, topics),
		open: { kind: "course", workspace: course.map.workspace },
	};
}
