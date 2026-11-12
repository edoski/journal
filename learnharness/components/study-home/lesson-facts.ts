import { courseLabel, type StudyCourse, type TopicHandle } from "@/src/core";
import { runupExam, stepWords, type NextStep, type PathPlace, type TodayRow } from "@/components/study-home/study-facts";

/** What a lesson's button does: open the session that waits, or take up the
 *  course's next step. The word names the step. */
export type LessonAction = "Open" | "Review" | "Continue" | "Start";

/**
 * One lesson of Today in plain words, the same for every study home: what
 * it is by name, the course it belongs to, what its second line says and
 * where it sits in the course's path. Engine fields only.
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
	place: PathPlace | null;
	open: { kind: "session"; href: string } | { kind: "course"; workspace: string };
}

const ACTION: Record<NextStep["kind"], LessonAction> = { review: "Review", task: "Continue", topic: "Continue", none: "Start" };

/** Where some topics sit in the course's path (the engine's order,
 *  prerequisites first, from 1); null when none is on the map. Pure. */
export function topicSpan(course: StudyCourse, topics: readonly TopicHandle[]): PathPlace | null {
	const at = topics.map((h) => course.map.topics.findIndex((t) => t.handle === h)).filter((i) => i >= 0);
	if (at.length === 0) return null;
	return { from: Math.min(...at) + 1, to: Math.max(...at) + 1, of: course.map.topics.length };
}

/** "Topic 7 of 16", "Topics 2 to 9 of 16". Pure. */
export function spanWords(place: PathPlace): string {
	return place.from === place.to ? `Topic ${place.from} of ${place.of}` : `Topics ${place.from} to ${place.to} of ${place.of}`;
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
			place: course ? topicSpan(course, topics) : null,
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
		detail: step.kind === "review" ? (then ? `Then ${then}` : null) : step.kind === "task" ? step.step : null,
		action: ACTION[step.kind],
		topics,
		place: topicSpan(course, topics),
		open: { kind: "course", workspace: course.map.workspace },
	};
}

/** A topic on a lesson's path track: worked on today, started before
 *  today, or still ahead. */
export type TrackMark = "today" | "started" | "ahead";

/** One mark per topic of the course, in path order. Pure. */
export function trackMarks(course: StudyCourse, topics: readonly TopicHandle[]): TrackMark[] {
	const today = new Set<string>(topics);
	return course.map.topics.map((t) => (today.has(t.handle) ? "today" : t.level === "new" ? "ahead" : "started"));
}
