/**
 * Four courses shaped like the seeded demo (2026-11-08), for what needs the
 * learner now (`needsYouNow`) and the sidebar's Inbox candidates: Linear
 * Algebra with two sessions waiting on him (Eigenvalues, then Rank), a
 * planned review in Probability (3 days overdue) and Real Analysis (a week),
 * and Calculus I with a lapse on Chain rule. Built by hand, engine fields
 * only.
 */
import type { ChatListItem, CourseMap, CourseMapTopic, StudyCourse, TopicHandle, TopicLevel, TopicReview } from "../../src/core/index.ts";

export const TODAY = "2026-11-08";

export function topic(handle: string, title: string, level: TopicLevel, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return {
		handle: handle as TopicHandle,
		title,
		level,
		introduced: level === "new" ? null : "2026-10-20",
		review: null,
		weak: false,
		signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false },
		tasks: [],
		...over,
	};
}

export const due = (overdue: number): TopicReview => ({ kind: "due", date: "2026-11-01", overdue });
export const back = (date: string): TopicReview => ({ kind: "scheduled", date });
const lapsed = { gap: null, lapsed: true, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };

export function map(over: Partial<CourseMap>): CourseMap {
	return { workspace: "/s/x", title: "X", today: TODAY, revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [], edges: [], ...over };
}

const h = (...handles: string[]) => handles as TopicHandle[];

export const LINALG: StudyCourse = {
	map: map({
		workspace: "/s/linalg",
		title: "Linear Algebra",
		exam: { date: "2026-11-29", daysLeft: 21 },
		current: "rank" as TopicHandle,
		topics: [
			topic("vectors", "Vectors", "transferred", { review: back("2026-11-13") }),
			topic("independence", "Linear independence", "retained", { review: due(4) }),
			topic("rank", "Rank and the column space", "assisted", { review: due(3), weak: true }),
			topic("det", "Determinants", "assisted"),
			topic("eigen", "Eigenvalues and eigenvectors", "introduced"),
			topic("diag", "Diagonalization", "new"),
		],
	}),
	unready: h("independence", "rank", "det", "eigen", "diag"),
	due: h("independence"),
	lastActiveDaysAgo: 2,
	newToday: [],
};

export const PROB: StudyCourse = {
	map: map({
		workspace: "/s/prob",
		title: "Probability",
		exam: { date: "2026-11-19", daysLeft: 11 },
		current: "bayes" as TopicHandle,
		topics: [
			topic("rv", "Random variables and distributions", "independent", { review: due(3) }),
			topic("total", "Law of total probability", "independent", { review: due(1), weak: true }),
			topic("bayes", "Bayes' rule", "independent", { review: due(1) }),
			topic("cond", "Conditional probability", "retained", { review: back("2026-11-12") }),
		],
	}),
	unready: [],
	due: h("rv", "total", "bayes"),
	lastActiveDaysAgo: 2,
	newToday: [],
};

export const ANALYSIS: StudyCourse = {
	map: map({
		workspace: "/s/ra",
		title: "Real Analysis",
		exam: { date: "2027-01-26", daysLeft: 79 },
		topics: [topic("conv", "Convergent sequences", "independent", { review: due(7) }), topic("cauchy", "Cauchy sequences", "retained", { review: due(7) })],
	}),
	unready: null,
	due: h("conv", "cauchy"),
	lastActiveDaysAgo: 11,
	newToday: [],
};

export const CALCULUS: StudyCourse = {
	map: map({
		workspace: "/s/calc",
		title: "Calculus I",
		current: "limits" as TopicHandle,
		topics: [
			topic("limits", "Limits", "transferred", { review: back("2026-11-20") }),
			topic("riemann", "Riemann sums", "independent", { review: due(2) }),
			topic("chain", "Chain rule", "independent", { review: due(1), signals: lapsed }),
			topic("improper", "Improper integrals", "independent", { review: due(3) }),
		],
	}),
	unready: null,
	due: h("chain", "riemann", "improper"),
	lastActiveDaysAgo: 1,
	newToday: [],
};

export const COURSES: readonly StudyCourse[] = [LINALG, PROB, ANALYSIS, CALCULUS];

export function chat(id: string, over: Partial<ChatListItem> = {}): ChatListItem {
	return {
		id,
		title: id,
		kind: "teach",
		createdAt: "2026-11-01T08:00:00.000Z",
		updatedAt: "2026-11-01T09:00:00.000Z",
		messageCount: 4,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		busy: false,
		compacting: false,
		ownTopics: over.topics ?? [],
		...over,
	};
}

const la = { workspace: "/s/linalg", title: "Linear Algebra" };

/** Two sessions waiting on him in Linear Algebra since this morning (the
 *  newest first once sorted), one waiting since before yesterday, an idle
 *  one on Determinants, and a general question on no course. */
export const CHATS: readonly ChatListItem[] = [
	chat("chat_rank", { title: "Rank practice", course: la, topics: ["rank", "not-on-map"], pendingProblem: true, updatedAt: "2026-11-08T08:50:00.000Z" }),
	chat("chat_eigen", { title: "Eigenvalues lesson", course: la, topics: ["eigen"], pendingQuestion: true, updatedAt: "2026-11-08T09:20:00.000Z" }),
	chat("chat_old", { title: "Determinants, second pass", course: la, topics: ["det"], pendingQuestion: true, updatedAt: "2026-11-05T09:00:00.000Z" }),
	chat("chat_det", { title: "Determinants as volume", course: la, topics: ["det"], updatedAt: "2026-11-07T18:00:00.000Z" }),
	chat("chat_general", { title: "Why are vectors columns?", updatedAt: "2026-11-07T09:00:00.000Z" }),
];
