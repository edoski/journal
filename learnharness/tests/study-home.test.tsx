/**
 * The study home's agenda: what it says from the engine's map and plan, the cross-course order, and
 * that reviews are named by topic, never counted. Same tsx classic-JSX shim
 * as the other render tests.
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
	continueWords,
	marksSummary,
	nextStepOf,
	nextUp,
	standingWords,
	stepWords,
	titleList,
	topicMarks,
	upcomingReviews,
	waitingSessions,
} from "../components/study-home/study-facts.ts";
import { Agenda } from "../components/study-home/agenda.tsx";
import type { HomeProps } from "../components/study-home/home-props.ts";
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
		signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 },
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
		tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" }],
		topics: [
			topic("vectors", "Vectors", "transferred", { review: { kind: "scheduled", date: "2026-11-13" } }),
			topic("span", "Span", "retained", { review: due(10) }),
			topic("independence", "Linear independence", "assisted", { review: due(16), weak: true, signals: { gap: "Misses a third vector", lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 } }),
			topic("rank", "Rank", "assisted", { review: due(3), weak: true }),
			topic("eigen", "Eigenvalues", "new"),
		],
	}),
	unready: ["span", "independence", "rank", "eigen"] as TopicHandle[],
	lastActiveDaysAgo: 2,
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
	lastActiveDaysAgo: 4,
};
const ANALYSIS: StudyCourse = {
	map: map({ workspace: "/s/ra", title: "Real Analysis", exam: { date: "2027-01-26", daysLeft: 79 }, topics: [topic("seq", "Sequences", "independent", { review: due(1) })] }),
	unready: null,
	lastActiveDaysAgo: 11,
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
	it("groups the engine's levels into three bands, in path order", () => {
		assert.deepEqual(topicMarks(LINALG).map((m) => m.band), ["solid", "solid", "learning", "learning", "new"]);
		assert.equal(marksSummary(topicMarks(LINALG)), "Topics: solid 2 of 5, learning 2 of 5, not started 1 of 5");
	});

	it("names the slipping topics and, in the run-up, the ones not started; never a count", () => {
		assert.equal(standingWords(LINALG), "Linear independence and Rank are slipping. Not started: Eigenvalues.");
		assert.equal(standingWords(ANALYSIS), "Sequences is due for review.");
		assert.equal(standingWords(PROB), "Nothing due for review.");
		assert.equal(titleList(["A", "B", "C"]), "A, B and more");
	});

	it("words the next step in the order Continue takes it", () => {
		assert.equal(stepWords(nextStepOf(LINALG)), "Review Linear independence, Rank and more");
		assert.equal(continueWords(LINALG), "Reviews, then Problem sheet 4");
		assert.equal(stepWords(nextStepOf(PROB)), "Continue Bayes' rule");
	});

	it("puts a course in its exam run-up first, the nearest exam first", () => {
		assert.deepEqual(byUrgency([ANALYSIS, LINALG, PROB]).map((c) => c.map.title), ["Probability", "Linear Algebra", "Real Analysis"]);
	});

	it("leads with a session waiting on the learner, else the most urgent course with a step", () => {
		const waiting = waitingSessions([chat({ id: "idle" }), chat({ id: "q", pendingQuestion: true }), chat({ id: "w", busy: true, pendingQuestion: true })]);
		assert.deepEqual(waiting.map((c) => c.id), ["q"]);
		const first = nextUp([LINALG], waiting);
		assert.equal(first.kind === "session" && first.chat.id, "q");
		const course = nextUp([ANALYSIS, PROB], []);
		assert.equal(course.kind === "course" && course.course.map.title, "Probability");
	});

	it("lists the reviews the engine scheduled this week by date", () => {
		assert.deepEqual(upcomingReviews([LINALG, PROB]).map((r) => [r.date, r.topic]), [
			["2026-11-09", "Conditional probability"],
			["2026-11-13", "Vectors"],
		]);
	});
});

describe("the study read", () => {
	it("joins the map with plan's run-up and last activity, dropping handles the map does not list", () => {
		const plan = { courses: [{ runup: { days_left: 21, unready: ["span", "gone"] }, last_activity: { days_ago: 2 } }] };
		const course = studyCourseOf(LINALG.map, plan);
		assert.deepEqual(course.unready, ["span"]);
		assert.equal(course.lastActiveDaysAgo, 2);
		assert.deepEqual(studyCourseOf(LINALG.map, { courses: [{}] }), { map: LINALG.map, unready: null, lastActiveDaysAgo: null });
	});
});

describe("the study home", () => {
	const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
	const props: HomeProps = {
		courses: [ANALYSIS, LINALG, PROB],
		waiting: [chat({ id: "q", title: "Eigen lesson", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" } })],
		today: TODAY,
		busy: false,
		onContinue: () => {},
	};
	const render = (node: React.ReactNode) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;

	it("shows every course, its exam, the waiting session, and no due counts", () => {
		const doc = render(<Agenda {...props} />);
		const text = doc.body.textContent ?? "";
		for (const title of ["Linear Algebra", "Probability", "Real Analysis"]) assert.match(text, new RegExp(title));
		assert.match(text, /11 days/);
		assert.ok(doc.querySelector('a[href="/chat/q"]'), "the waiting session opens");
		assert.doesNotMatch(text, /\d+\s+due\b/i);
		assert.equal(doc.querySelectorAll('[data-slot="topic-strip"]').length, 3);
	});

	it("holds one primary action, Now, and the week's reviews by day", () => {
		const doc = render(<Agenda {...props} />);
		assert.match(doc.querySelector('[data-slot="agenda-now"]')?.textContent ?? "", /Eigen lesson/);
		assert.equal(doc.querySelectorAll('[data-slot="agenda-day"]').length, 2);
		assert.match(doc.querySelector('[data-slot="agenda-day"]')?.textContent ?? "", /Tomorrow.*Conditional probability/);
	});
});
