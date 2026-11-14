/**
 * The study home's Today: what each line says from the engine's map and
 * plan, the order across courses, what Today's rows say, and
 * that reviews are named by topic, never counted. Same tsx classic-JSX
 * shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
	byUrgency,
	nextStepOf,
	stepWords,
	titleList,
	todayRows,
	openSessions,
	todayCourses,
	courseMove,
	studyQuestion,
	type TodayRow,
} from "../components/study-home/study-facts.ts";
import { lessonOf, topicSpan } from "../components/study-home/lesson-facts.ts";
import { LessonButton } from "../components/study-home/lesson-button.tsx";
import { Today } from "../components/study-home/today.tsx";
import { courseProgress, foldLines, studiedAgo, whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { studyCourseOf } from "../src/server/study.ts";
import type { ChatListItem, CourseMap, CourseMapTopic, StudyCourse, TopicHandle, TopicLevel } from "../src/core/index.ts";

const TODAY = "2026-11-08";

function topic(handle: string, title: string, level: TopicLevel, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return {
		handle: handle as TopicHandle,
		title,
		level,
		introduced: null,
		review: null,
		weak: false,
		signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false },
		tasks: [],
		...over,
	};
}
const due = (overdue: number) => ({ kind: "due" as const, date: "2026-11-01", overdue });

function map(over: Partial<CourseMap>): CourseMap {
	return {
		workspace: "/s/linalg",
		title: "Linear Algebra",
		today: TODAY,
		revision: 3,
		exam: null,
		current: null,
		focus: null,
		tasks: [],
		topics: [],
		edges: [],
		...over,
	};
}

const LINALG: StudyCourse = {
	map: map({
		exam: { date: "2026-11-29", daysLeft: 21 },
		current: "rank" as TopicHandle,
		focus: "sheet-4",
		tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Pending question, not yet answered: part (c). He needs the matrix first", updated: "2026-11-05" }],
		topics: [
			topic("vectors", "Vectors", "transferred", { review: { kind: "scheduled", date: "2026-11-13" } }),
			topic("span", "Span", "retained", { review: due(10) }),
			topic("independence", "Linear independence", "assisted", { review: due(16), weak: true, signals: { gap: "Misses a third vector", lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false } }),
			topic("rank", "Rank", "assisted", { review: due(3), weak: true }),
			topic("eigen", "Eigenvalues", "new"),
		],
	}),
	unready: ["span", "independence", "rank", "eigen"] as TopicHandle[],
	due: null,
	newToday: [], lastActiveDaysAgo: 2,
};
const PROB: StudyCourse = {
	map: map({
		workspace: "/s/prob",
		title: "Probability",
		exam: { date: "2026-11-19", daysLeft: 11 },
		current: "bayes" as TopicHandle,
		topics: [topic("conditional", "Conditional probability", "independent", { review: { kind: "scheduled", date: "2026-11-09" } }), topic("bayes", "Bayes' rule", "independent")],
	}),
	unready: [],
	due: [],
	newToday: [], lastActiveDaysAgo: 4,
};
const ANALYSIS: StudyCourse = {
	map: map({ workspace: "/s/ra", title: "Real Analysis", exam: { date: "2027-01-26", daysLeft: 79 }, topics: [topic("seq", "Sequences", "independent", { review: due(1) })] }),
	unready: null,
	due: ["seq" as TopicHandle],
	newToday: [], lastActiveDaysAgo: 11,
};

function chat(over: Partial<ChatListItem>): ChatListItem {
	return {
		id: "c1",
		title: "Eigen lesson",
		kind: "teach",
		createdAt: "2026-11-08T08:00:00.000Z",
		updatedAt: "2026-11-08T09:00:00.000Z",
		messageCount: 4,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		busy: false,
		compacting: false,
		...over,
	};
}

describe("study facts", () => {
	it("asks the home's question for the hour, never naming the date", () => {
		assert.deepEqual(
			[4, 5, 11, 12, 17, 18, 21, 22].map(studyQuestion),
			[
				"What are we studying tonight?",
				"What are we studying this morning?",
				"What are we studying this morning?",
				"What are we studying this afternoon?",
				"What are we studying this afternoon?",
				"What are we studying this evening?",
				"What are we studying this evening?",
				"What are we studying tonight?",
			],
		);
	});

	it("words the next step in the order Continue takes it, naming every review with commas and never counting them", () => {
		assert.equal(stepWords(nextStepOf(LINALG)), "Review Linear independence, Rank, Span");
		assert.equal(stepWords(nextStepOf(PROB)), "Continue Bayes' rule");
		assert.equal(titleList(["A", "B", "C"]), "A, B, C");
		assert.equal(titleList(["Random variables and distributions", "Independent events"]), "Random variables and distributions, Independent events");
	});

	it("takes today's review from the engine's plan, in its order", () => {
		const planned: StudyCourse = { ...LINALG, due: ["rank", "span"] as TopicHandle[] };
		const step = nextStepOf(planned);
		assert.equal(stepWords(step), "Review Rank, Span");
		assert.deepEqual(step.kind === "review" && step.topics, ["rank", "span"]);
	});

	it("starts the new topics today's plan names, once reviews and the open task are done", () => {
		const fresh: StudyCourse = { ...PROB, newToday: ["bayes"] as TopicHandle[] };
		const step = nextStepOf(fresh);
		assert.equal(stepWords(step), "Start Bayes' rule");
		assert.deepEqual(step.kind === "topic" && [step.topics, step.planned], [["bayes"], true]);
		assert.equal(whyOf({ kind: "course", course: fresh, step })?.short, "Planned today");
		assert.equal(stepWords(nextStepOf({ ...LINALG, newToday: ["span"] as TopicHandle[] })), "Review Linear independence, Rank, Span", "reviews still come first");
	});

	it("puts a course in its exam run-up first, the nearest exam first", () => {
		assert.deepEqual(byUrgency([ANALYSIS, LINALG, PROB]).map((c) => c.map.title), ["Probability", "Linear Algebra", "Real Analysis"]);
	});
});

describe("today's lines", () => {
	const eigen = chat({ id: "q", title: "Eigen lesson", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" } });

	it("gives each recent session to pick up a line first, and keeps every course's next step that no such session works on", () => {
		const writing = chat({ id: "w", busy: true, course: { workspace: "/s/prob", title: "Probability" }, updatedAt: "2026-11-08T08:00:00.000Z" });
		const open = openSessions([chat({ id: "idle" }), writing, eigen]);
		assert.deepEqual(open.map((c) => c.id), ["q", "w"], "a session waiting on him and one the tutor writes in, never a finished one");
		const rows = todayRows([ANALYSIS, LINALG, PROB], open, TODAY);
		assert.deepEqual(
			rows.map((r) => (r.kind === "session" ? `session ${r.chat.id}` : r.course.map.title)),
			["session q", "session w", "Probability", "Linear Algebra", "Real Analysis"],
			"Linear Algebra's due review keeps its line beside the waiting lesson on another topic",
		);
		assert.deepEqual(todayCourses(rows).map((c) => c.map.title), ["Linear Algebra", "Probability", "Real Analysis"], "each course once for the map's tabs");
	});

	it("lets a session that works on the step stand for it", () => {
		const review = chat({ id: "r", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["independence", "rank", "span"] });
		const rows = todayRows([LINALG], [review], TODAY);
		assert.deepEqual(rows.map((r) => r.kind), ["session"]);
		const sheet = chat({ id: "s", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" }, tasks: ["sheet-4"] });
		assert.deepEqual(todayRows([{ ...LINALG, due: [] }], [sheet], TODAY).map((r) => r.kind), ["session"], "the open task's lesson");
	});

	it("gives a second session waiting in the same course its own line too, the newest first, and keeps the course's line for the step neither works on", () => {
		const rank = chat({ id: "r", title: "Rank practice", pendingProblem: true, updatedAt: "2026-11-08T08:30:00.000Z", course: { workspace: "/s/linalg", title: "Linear Algebra" } });
		const rows = todayRows([ANALYSIS, LINALG, PROB], openSessions([rank, eigen]), TODAY);
		assert.deepEqual(
			rows.map((r) => (r.kind === "session" ? `session ${r.chat.id}` : r.course.map.title)),
			["session q", "session r", "Probability", "Linear Algebra", "Real Analysis"],
		);
	});

	it("leaves a session waiting since before yesterday to the sidebar", () => {
		const old = { ...eigen, updatedAt: "2026-11-05T09:00:00.000Z" };
		const rows = todayRows([LINALG], [old], TODAY);
		assert.deepEqual(rows.map((r) => r.kind), ["course"]);
	});
});

describe("lessons", () => {
	const lesson = (course: StudyCourse) => lessonOf(todayRows([course], [], TODAY)[0]!);

	it("words a course's step as a lesson: its name, what follows, its button and its topics' place in the path", () => {
		const review = lesson(LINALG);
		assert.equal(review.title, "Review Linear independence, Rank, Span");
		assert.equal(review.detail, "Then Problem sheet 4");
		assert.equal(review.action, "Review");
		assert.equal(review.exam, "Exam in 21 days");
		assert.deepEqual(review.place, { from: 2, to: 4, of: 5 });
		const topic = lesson(PROB);
		assert.deepEqual([topic.title, topic.detail, topic.action, topic.place], ["Continue Bayes' rule", null, "Continue", { from: 2, to: 2, of: 2 }]);
		assert.equal(lesson({ ...PROB, map: { ...PROB.map, current: null } }).action, "Start");
	});

	it("leaves out a Then that only repeats a review", () => {
		const course: StudyCourse = { ...ANALYSIS, map: { ...ANALYSIS.map, current: "seq" as TopicHandle } };
		assert.deepEqual([lesson(course).title, lesson(course).detail], ["Review Sequences", null]);
	});

	it("places a waiting session at the course topics its transcript worked on", () => {
		const waiting = chat({ id: "q", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["eigen", "charpoly"] });
		const reply = lessonOf(todayRows([LINALG], [waiting], TODAY)[0]!);
		assert.deepEqual([reply.kind, reply.title, reply.detail, reply.action], ["reply", "Eigen lesson", "Waiting for your reply", "Open"]);
		assert.deepEqual(reply.open, { kind: "session", href: "/chat/q" });
		assert.deepEqual(reply.place, { from: 5, to: 5, of: 5 });
		const unplaced = lessonOf(todayRows([LINALG], [{ ...waiting, topics: [] }], TODAY)[0]!);
		assert.equal(unplaced.place, null);
		assert.equal(topicSpan(LINALG, ["gone"] as TopicHandle[]), null);
	});

});

describe("the study read", () => {
	it("joins the map with plan's run-up, today's review and last activity, dropping handles the map does not list", () => {
		const plan = {
			courses: [{ runup: { days_left: 21, unready: ["span", "gone"] }, due: [{ topic: "rank" }, { topic: "gone" }, { topic: "span" }], last_activity: { days_ago: 2 } }],
		};
		const course = studyCourseOf(LINALG.map, plan);
		assert.deepEqual(course.unready, ["span"]);
		assert.deepEqual(course.due, ["rank", "span"]);
		assert.equal(course.lastActiveDaysAgo, 2);
		assert.deepEqual(studyCourseOf(LINALG.map, { courses: [{}] }), { map: LINALG.map, unready: null, due: [], lastActiveDaysAgo: null, newToday: [] });
		assert.equal(studyCourseOf(LINALG.map, null).due, null);
	});

	it("reads the new topics today's plan starts, only when its first day is today", () => {
		const day = (date: string) => ({ today: "2026-11-08", courses: [{ plan: { days: [{ date, reviews: [], new: ["span", "gone"] }] } }] });
		assert.deepEqual(studyCourseOf(LINALG.map, day("2026-11-08")).newToday, ["span"]);
		assert.deepEqual(studyCourseOf(LINALG.map, day("2026-11-09")).newToday, [], "a later day is not today's");
	});
});

describe("Today", () => {
	const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
	const render = (node: React.ReactNode) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
	const waiting = [chat({ id: "q", title: "Eigen lesson", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" } })];

	it("gives each line its pie, its course ending in how long ago it was studied, and its lesson ending in an icon and a few words for why it is on Today, with no button and no review counted", () => {
		const doc = render(<Today rows={todayRows([ANALYSIS, LINALG, PROB], waiting, TODAY)} busy={false} onContinue={() => {}} />);
		const lines = [...doc.querySelectorAll('[data-slot="today-line"]')];
		assert.deepEqual(
			lines.map((l) => l.textContent),
			["Linear Algebra2d agoEigen lessonYour turn", "Probability4d agoContinue Bayes' ruleNext up", "Linear Algebra2d agoReview Linear independence, Rank, Span2w overdue", "Real Analysis11d agoReview Sequences1d overdue"],
		);
		assert.equal(lines[0]!.getAttribute("href"), "/chat/q");
		assert.equal(doc.querySelectorAll('[data-slot="today-progress"]').length, 4);
		assert.deepEqual([...doc.querySelectorAll('[data-slot="today-why"]')].map((w) => [w.getAttribute("data-kind"), w.querySelectorAll("svg").length]), [["reply", 1], ["next", 1], ["review", 1], ["review", 1]]);
		assert.equal(doc.querySelectorAll(".bg-primary").length, 0);
		assert.doesNotMatch(doc.body.textContent ?? "", /Exam|Then |Step|\d+\s+due\b/i);
		assert.match(doc.querySelector("#today-heading")?.textContent ?? "", /^What are we studying (this morning|this afternoon|this evening|tonight)\?$/);
	});

	it("past five lines, names the other courses on the last", () => {
		const many = Array.from({ length: 6 }, (_, i) => ({ ...PROB, map: { ...PROB.map, workspace: `/s/c${i}`, title: `Course ${i}` } }));
		const doc = render(<Today rows={todayRows(many, [], TODAY)} busy={false} onContinue={() => {}} />);
		assert.equal(doc.querySelectorAll('[data-slot="today-line"]').length, 4);
		assert.match(doc.querySelector('[data-slot="today-also"]')?.textContent ?? "", /Also today:Course 4Course 5/);
	});
});


describe("what a line of Today reads", () => {
	const waiting = chat({ id: "q", title: "Eigen lesson", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" } });
	const lapsed: StudyCourse = {
		...ANALYSIS,
		map: { ...ANALYSIS.map, topics: [topic("seq", "Sequences", "independent", { review: due(0), signals: { gap: null, lapsed: true, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false } })] },
	};
	const rowOf = (course: StudyCourse) => todayRows([course], [], TODAY)[0]!;

	it("gives each reason a kind and a few words that fit beside its icon, from the engine's fields", () => {
		const short = (row: TodayRow) => {
			const why = whyOf(row);
			return why && [why.kind, why.short];
		};
		assert.deepEqual(short(todayRows([LINALG], [waiting], TODAY)[0]!), ["reply", "Your turn"]);
		assert.deepEqual(short(rowOf(LINALG)), ["review", "2w overdue"]);
		assert.deepEqual(short(rowOf(ANALYSIS)), ["review", "1d overdue"]);
		assert.deepEqual(short(rowOf(lapsed)), ["missed", "Missed Sequences"]);
		assert.deepEqual(short(rowOf({ ...LINALG, due: [] })), ["task", "Left off 3d ago"], "when the task was left, never the tutor's step");
		assert.deepEqual(short(rowOf(PROB)), ["next", "Next up"]);
	});

	it("says how long ago a course was studied in a few characters", () => {
		const ago = (days: number | null) => studiedAgo(rowOf({ ...LINALG, lastActiveDaysAgo: days }));
		assert.deepEqual([0, 1, 2, 13, 14, 59, 60, null].map(ago), ["Today", "Yesterday", "2d ago", "13d ago", "2w ago", "8w ago", "2mo ago", null]);
	});

	it("counts how much of a course he can do on his own, weak topics left out", () => {
		assert.deepEqual(courseProgress(LINALG), { solid: 2, of: 5 });
		assert.deepEqual(courseProgress(PROB), { solid: 2, of: 2 });
		assert.equal(courseProgress({ ...LINALG, map: { ...LINALG.map, topics: [] } }), null);
	});

	it("folds a sixth course into the last line", () => {
		const many = Array.from({ length: 6 }, (_, i) => ({ ...PROB, map: { ...PROB.map, workspace: `/s/c${i}`, title: `Course ${i}` } }));
		const { shown, also } = foldLines(todayRows(many, [], TODAY));
		assert.deepEqual([shown.length, also.length], [4, 2]);
	});

	const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
	const render = (node: React.ReactNode) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
	const rows = () => todayRows([ANALYSIS, LINALG, PROB], [waiting], TODAY);
	const props = () => ({ rows: rows(), busy: false, onContinue: () => {} });
	const plain = (doc: Document) => {
		assert.equal(doc.querySelectorAll(".bg-primary").length, 0);
		assert.doesNotMatch(doc.body.textContent ?? "", /Exam|Then |Step|\d+\s+due\b/);
	};

	it("hybrid: each line has its pie, its course ending in how long ago it was studied, and its lesson ending in an icon and a few words for why it is on Today", () => {
		const doc = render(<HybridRows {...props()} />);
		const lines = [...doc.querySelectorAll('[data-slot="today-line"]')].map((l) => l.textContent);
		assert.deepEqual(lines, [
			"Linear Algebra2d agoEigen lessonYour turn",
			"Probability4d agoContinue Bayes' ruleNext up",
			"Linear Algebra2d agoReview Linear independence, Rank, Span2w overdue",
			"Real Analysis11d agoReview Sequences1d overdue",
		]);
		assert.equal(doc.querySelectorAll('[data-slot="today-progress"]').length, 4);
		assert.deepEqual([...doc.querySelectorAll('[data-slot="today-why"]')].map((w) => [w.getAttribute("data-kind"), w.querySelectorAll("svg").length]), [["reply", 1], ["next", 1], ["review", 1], ["review", 1]]);
		plain(doc);
	});
});
