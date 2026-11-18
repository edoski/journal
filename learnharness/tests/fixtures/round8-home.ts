/**
 * Linear Algebra on Mon 9 Nov 2026, the day after the Eigen lesson was left
 * for next time with its review promised for today (round 8, lens 1): the
 * shared world of the Home and navigation regression tests.
 */
import type { ChatListItem, CourseMap, CourseMapTopic, StudyCourse, TopicHandle } from "../../src/core/index.ts";

export const TODAY = "2026-11-09";
export const LA = { workspace: "/s/la", title: "Linear Algebra" };
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };

export const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({
	handle: handle as TopicHandle,
	title,
	level: "attempted",
	introduced: "2026-11-08",
	review: null,
	weak: false,
	signals: QUIET,
	tasks: [],
	...over,
});

export const map = (over: Partial<CourseMap> = {}): CourseMap => ({
	workspace: LA.workspace,
	title: LA.title,
	today: TODAY,
	revision: 1,
	exam: null,
	current: "eigen" as TopicHandle,
	focus: null,
	tasks: [],
	topics: [topic("eigen", "Eigenvalues and eigenvectors", { review: { kind: "due", date: TODAY, overdue: 0 } }), topic("rank", "Rank and the column space")],
	edges: [],
	...over,
});

/** Linear Algebra on Mon 9 Nov: Eigen's review is due today, as the close promised. */
export const COURSE: StudyCourse = { map: map(), unready: null, due: ["eigen" as TopicHandle], newToday: [], lastActiveDaysAgo: 1 };

export function chat(over: Partial<ChatListItem>): ChatListItem {
	return {
		id: "lesson",
		title: "Eigenvalues and eigenvectors",
		kind: "teach",
		createdAt: "2026-11-08T08:00:00.000Z",
		updatedAt: "2026-11-08T10:00:00.000Z",
		messageCount: 6,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		busy: false,
		course: LA,
		topics: ["eigen"],
		ownTopics: ["eigen"],
		...over,
	};
}

/** The Eigen lesson, left for next time with Done for today yesterday. */
export const LEFT = chat({ ended: "left" });

