/**
 * The brief course page: the standing bar (the course's pie unrolled into
 * three counts), the three answers (Fix first, Review, Next) and what
 * each row says under its title, the one mistake sentence, and how an
 * answer draws. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseRead } from "../components/course-page/course-model.ts";
import { briefAnswers, briefMistake, mapAim, overdueWords, standingParts, standingSentence, taskLine, type Answer } from "../components/course-page/brief/brief-model.ts";
import { FADE, boxOf, centreOn, revealIn, surfaceOf } from "../components/course-page/brief/brief-map-view.ts";
import { NODE_HEIGHT, NODE_WIDTH, layoutTopicMap } from "../components/course-map/topic-map/topic-map-layout.ts";
import { StandingBar } from "../components/course-page/brief/standing-bar.tsx";
import { BriefAnswer } from "../components/course-page/brief/brief-answer.tsx";
import { BriefMistake } from "../components/course-page/brief/brief-mistake.tsx";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 };
const due = (overdue: number) => ({ kind: "due" as const, date: "2026-11-01", overdue });
const later = (date: string) => ({ kind: "scheduled" as const, date });

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const WS = "/study/linalg";
const TOPICS = [
	topic("vectors", { title: "Vectors", level: "transferred", review: later("2026-11-13") }),
	topic("span", { title: "Span", level: "retained", review: due(10) }),
	topic("basis", { title: "Basis", level: "independent", review: due(3), tasks: ["sheet-4"] }),
	topic("independence", { title: "Linear independence", level: "assisted", weak: true, review: due(16), signals: { ...QUIET, gap: "Treats pairwise non-parallel vectors as independent", confidentErrors: 1 } }),
	topic("matmul", { title: "Matrix multiplication", level: "independent", weak: true, review: due(2), signals: { ...QUIET, lapsed: true } }),
	topic("kernel", { title: "Kernel", level: "attempted", weak: true, review: due(1), signals: { ...QUIET, confidentErrors: 1 } }),
	topic("rank", { title: "Rank", level: "assisted", weak: true, review: due(3), signals: { ...QUIET, gap: "Counts nonzero entries instead of pivots" }, tasks: ["sheet-4"] }),
	topic("determinant", { title: "Determinants", level: "assisted", review: due(4) }),
	topic("cramer", { title: "Cramer's rule", level: "introduced", review: due(2) }),
	topic("invertible", { title: "Invertible matrices" }),
	topic("eigen", { title: "Eigenvalues" }),
	topic("inner", { title: "Inner products" }),
];

function course(over: Partial<StudyCourse["map"]> = {}, due: TopicHandle[] = [h("span")]): StudyCourse {
	return {
		map: {
			workspace: WS,
			title: "Linear Algebra",
			today: "2026-11-08",
			revision: 1,
			exam: { date: "2026-11-29", daysLeft: 21 },
			current: h("rank"),
			focus: "sheet-4",
			tasks: [{ key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: "Part (c): show dim ker A = 2" }],
			topics: TOPICS,
			edges: [
				{ kind: "needs", prerequisite: h("vectors"), topic: h("span") },
				{ kind: "needs", prerequisite: h("rank"), topic: h("invertible") },
				{ kind: "needs", prerequisite: h("determinant"), topic: h("invertible") },
				{ kind: "needs", prerequisite: h("span"), topic: h("inner") },
				{ kind: "needs", prerequisite: h("cramer"), topic: h("eigen") },
			],
			...over,
		},
		unready: null,
		due,
		lastActiveDaysAgo: 2,
	};
}

const chat = (id: string, over: Partial<ChatListItem> = {}): ChatListItem => ({
	id,
	title: id,
	kind: "teach",
	createdAt: "2026-11-07T08:00:00.000Z",
	updatedAt: "2026-11-07T09:00:00.000Z",
	messageCount: 4,
	phase: "teach",
	pendingQuestion: false,
	pendingProblem: false,
	busy: false,
	compacting: false,
	course: { workspace: WS, title: "Linear Algebra" },
	...over,
});

function viewOf(c: StudyCourse, chats: ChatListItem[] = [], waiting: ChatListItem[] = []) {
	const read = courseRead({ status: "ready", courses: [c], failed: [], waiting, chats }, c.map.workspace);
	assert.equal(read.status, "ready");
	return (read as Extract<typeof read, { status: "ready" }>).view;
}

const answerOf = (answers: readonly Answer[], id: Answer["id"]) => answers.find((a) => a.id === id)!;
const lines = (answer: Answer) => answer.topics.map((t) => [t.row.topic.title, t.words]);
const icons = (answer: Answer) => answer.topics.map((t) => t.fact?.kind ?? null);

describe("the standing bar's counts", () => {
	it("unrolls the course's pie: on his own as the pie counts it, started but not alone yet, not started", () => {
		const parts = standingParts(course());
		assert.deepEqual(
			parts.map((p) => p.words),
			["3 on your own", "6 learning", "3 not started"],
		);
		assert.deepEqual(
			parts.map((p) => p.fill),
			[1, 0.5, 0],
		);
		assert.equal(standingSentence(parts), "3 on your own, 6 learning and 3 not started, of 12 topics");
	});

	it("leaves out a part with no topics, and has none for an empty course", () => {
		const learned = course({ topics: TOPICS.map((t) => ({ ...t, level: "retained" as const, weak: false })) });
		assert.deepEqual(
			standingParts(learned).map((p) => p.words),
			["12 on your own"],
		);
		assert.equal(standingSentence(standingParts(learned)), "12 on your own, of 12 topics");
		assert.deepEqual(standingParts(course({ topics: [], edges: [] })), []);
	});

	it("draws one bar part per count, each as wide as its share, and writes only the counts the header does not say", () => {
		const document = parseHTML(`<html><body>${renderToStaticMarkup(<StandingBar parts={standingParts(course())} />)}</body></html>`).document;
		const bar = [...document.querySelectorAll('[data-slot="brief-standing-part"]')];
		assert.deepEqual(
			bar.map((p) => p.getAttribute("style")),
			["flex-grow:3", "flex-grow:6", "flex-grow:3"],
		);
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="brief-standing-count"]')].map((c) => c.textContent),
			["6 learning", "3 not started"],
			"the header already says how many he can do on his own",
		);
		assert.equal(document.querySelector(".sr-only")!.textContent, "3 on your own, 6 learning and 3 not started, of 12 topics");
	});
});

describe("the three answers", () => {
	const answers = briefAnswers(viewOf(course()));

	it("puts the slips under Fix first, a wrong answer he was sure of on top, each saying why in the map's words", () => {
		const fix = answerOf(answers, "fix");
		assert.deepEqual(lines(fix), [
			["Linear independence", "A mistake to fix"],
			["Kernel", "Sure, but wrong"],
			["Rank", "Problem sheet 4, part (c)"],
			["Matrix multiplication", "Missed last time"],
		]);
		assert.deepEqual(icons(fix), ["slip", "slip", "task", "slip"]);
	});

	it("puts every other topic whose review is due under Review, whatever his level, the longest overdue first, in Home's words", () => {
		const review = answerOf(answers, "review");
		assert.deepEqual(lines(review), [
			["Span", "1w overdue"],
			["Determinants", "4d overdue"],
			["Basis", "3d overdue"],
			["Cramer's rule", "2d overdue"],
		]);
		assert.deepEqual(icons(review), ["review", "review", "review", "review"]);
	});

	it("shows each topic in one answer only", () => {
		const handles = answers.flatMap((a) => a.topics.map((t) => t.row.topic.handle));
		assert.equal(new Set(handles).size, handles.length);
	});

	it("puts the open task on the one row of the topic it sits on, whichever answer holds it", () => {
		const withTask = answers.flatMap((a) => a.topics).filter((t) => t.fact?.kind === "task");
		assert.deepEqual(
			withTask.map((t) => [t.row.topic.title, t.words]),
			[["Rank", "Problem sheet 4, part (c)"]],
		);
	});

	it("lists the topics not started under Next, the ones he can start now first, counting what each still needs", () => {
		assert.deepEqual(lines(answerOf(answers, "next")), [
			["Inner products", "Ready to start"],
			["Invertible matrices", "Needs 2 topics first"],
			["Eigenvalues", "Needs 1 topic first"],
		]);
		assert.deepEqual(icons(answerOf(answers, "next")), [null, null, null]);
	});

	it("says a session waits on him before anything else, with its icon", () => {
		const waits = chat("c1", { title: "Rank practice", topics: [h("rank")], pendingProblem: true, updatedAt: "2026-11-08T08:00:00.000Z" });
		const rank = answerOf(briefAnswers(viewOf(course(), [waits])), "fix").topics.find((t) => t.row.topic.handle === "rank")!;
		assert.deepEqual([rank.words, rank.fact?.kind], ["Your turn", "your-turn"]);
	});

	it("leads Next with the topic of the header's lesson, in the header's words", () => {
		const waits = chat("c1", { title: "Eigen", topics: [h("eigen")], pendingQuestion: true, updatedAt: "2026-11-08T08:00:00.000Z" });
		const view = viewOf(course(), [waits], [waits]);
		assert.equal(view.next.row.kind, "session");
		const next = answerOf(briefAnswers(view), "next");
		assert.deepEqual(next.topics[0] && [next.topics[0].row.topic.title, next.topics[0].words], ["Eigenvalues", "Your turn"]);
	});

	it("leads Next with where he is when the button continues the current topic", () => {
		const view = viewOf(course({ tasks: [], focus: null, current: h("eigen") }, []));
		assert.equal(view.next.row.kind === "course" && view.next.row.step.kind, "topic");
		const next = answerOf(briefAnswers(view), "next");
		assert.deepEqual(next.topics[0] && [next.topics[0].row.topic.title, next.topics[0].words, next.topics[0].fact?.kind], ["Eigenvalues", "You are here", "here"]);
	});

	it("says what each answer has when it has nothing, naming the topic that comes back first", () => {
		const learned = course({ tasks: [], focus: null, topics: TOPICS.map((t, i) => ({ ...t, level: "retained" as const, weak: false, review: later(`2026-11-${12 - (i % 3)}`) })) }, []);
		const empty = briefAnswers(viewOf(learned));
		assert.deepEqual(
			empty.map((a) => [a.title, a.topics.length, a.empty]),
			[
				["Fix first", 0, "Nothing to fix"],
				["Review", 0, "Back Tue 10 Nov: Basis"],
				["Next", 0, "Nothing new to start"],
			],
		);
		const unscheduled = briefAnswers(viewOf(course({ topics: TOPICS.map((t) => ({ ...t, review: null, weak: false })) }, [])));
		assert.equal(answerOf(unscheduled, "review").empty, "Nothing due");
	});

	it("says how overdue a review is the way Home and the header do", () => {
		const c = course();
		const at = (overdue: number) => overdueWords(c, topic("x", { title: "X", level: "retained", review: due(overdue) }));
		assert.deepEqual([at(0), at(1), at(6), at(7), at(20)], ["Due today", "1d overdue", "6d overdue", "1w overdue", "2w overdue"]);
	});

	it("names where an open task was left in a few words", () => {
		assert.equal(taskLine({ title: "Problem sheet 4: rank and nullity", step: "Part (c): show dim ker A = 2" }), "Problem sheet 4, part (c)");
		assert.equal(taskLine({ title: "Problem sheet 5", step: null }), "Problem sheet 5");
	});
});

describe("the mistake sentence", () => {
	it("is the engine's sentence on the first topic to fix that has one", () => {
		const mistake = briefMistake(briefAnswers(viewOf(course())));
		assert.deepEqual(mistake && [mistake.row.topic.title, mistake.sentence], ["Linear independence", "Treats pairwise non-parallel vectors as independent"]);
	});

	it("is absent when no topic to fix has one", () => {
		const quiet = course({ topics: TOPICS.map((t) => ({ ...t, signals: { ...t.signals, gap: null } })) });
		assert.equal(briefMistake(briefAnswers(viewOf(quiet))), null);
	});
});

describe("where the map opens", () => {
	it("opens on where he is when that topic needs him or is being learned", () => {
		const view = viewOf(course());
		assert.equal(mapAim(view, briefAnswers(view)), "rank");
	});

	it("opens on the first topic the answers name when where he is is a topic he can do on his own with nothing due", () => {
		const view = viewOf(course({ current: h("vectors") }));
		assert.equal(mapAim(view, briefAnswers(view)), "independence");
	});

	it("opens on the first topic named when the course has no current topic, and on nothing when nothing is named", () => {
		const view = viewOf(course({ current: null }));
		assert.equal(mapAim(view, briefAnswers(view)), "independence");
		const empty = viewOf(course({ current: null, topics: [], edges: [], tasks: [], focus: null }, []));
		assert.equal(mapAim(empty, briefAnswers(empty)), null);
	});
});

describe("the map pane", () => {
	const map = course().map;
	const layout = layoutTopicMap(map.topics, map.edges);

	it("draws on a surface the whole course fits at full size with the map's room, never smaller than the pane", () => {
		const small = surfaceOf(layout, { width: 300, height: 200 });
		assert.deepEqual(small, { width: layout.width + FADE.x * 2, height: layout.height + (FADE.y + 20) * 2 });
		assert.deepEqual(surfaceOf(layout, { width: 5000, height: 4000 }), { width: 5000, height: 4000 });
	});

	it("finds a topic where the map draws it, in the surface's middle", () => {
		const surface = { width: layout.width + 400, height: layout.height + 200 };
		const at = layout.topics.get(h("rank"))!;
		assert.deepEqual(boxOf(layout, surface, h("rank")), { x: 200 + at.x, y: 100 + at.y, width: NODE_WIDTH, height: NODE_HEIGHT });
		assert.equal(boxOf(layout, surface, h("nowhere")), null);
	});

	it("centres a topic in the pane as near as the surface's edges allow", () => {
		const surface = { width: 2000, height: 1000 };
		const pane = { width: 800, height: 300 };
		assert.deepEqual(centreOn({ x: 900, y: 400, width: 200, height: 60 }, pane, surface), { left: 600, top: 280 });
		assert.deepEqual(centreOn({ x: 10, y: 10, width: 200, height: 60 }, pane, surface), { left: 0, top: 0 });
		assert.deepEqual(centreOn({ x: 1900, y: 990, width: 200, height: 60 }, pane, surface), { left: 1200, top: 700 });
	});

	it("moves only as far as brings a topic clear of the fade, and not at all when it is clear", () => {
		const surface = { width: 2000, height: 1000 };
		const view = { left: 0, top: 0, width: 800, height: 300 };
		assert.equal(revealIn({ x: 300, y: 100, width: 224, height: 64 }, view, surface), null);
		assert.deepEqual(revealIn({ x: 300, y: 400, width: 224, height: 64 }, view, surface), { left: 0, top: 400 + 64 + FADE.y - 300 });
		assert.deepEqual(revealIn({ x: 1000, y: 100, width: 224, height: 64 }, view, surface), { left: 1000 + 224 + FADE.x - 800, top: 0 });
	});
});

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;

describe("an answer", () => {
	const answers = briefAnswers(viewOf(course()));

	it("heads its topics with its name, no count, draws the first rows with their words under the title and their icon at the end, then Show N more", () => {
		const document = render(<BriefAnswer answer={answerOf(answers, "fix")} limit={3} />);
		assert.equal(document.querySelector('[data-slot="course-group-header"]')!.textContent, "Fix first");
		const rows = [...document.querySelectorAll('[data-slot="course-topic-row"]')];
		assert.equal(rows.length, 3);
		assert.ok(rows[0]!.textContent!.startsWith("Linear independence, Nearly on your ownA mistake to fix"));
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-topic-fact"]')].map((f) => f.getAttribute("data-kind")),
			["slip", "slip", "task"],
		);
		assert.equal(document.querySelector('[data-slot="course-group-more"]')!.textContent, "Show 1 more");
	});

	it("shows fewer rows when the page asks for fewer", () => {
		const document = render(<BriefAnswer answer={answerOf(answers, "fix")} limit={2} />);
		assert.equal(document.querySelectorAll('[data-slot="course-topic-row"]').length, 2);
		assert.equal(document.querySelector('[data-slot="course-group-more"]')!.textContent, "Show 2 more");
	});

	it("says it has nothing in one quiet line", () => {
		const document = render(<BriefAnswer answer={{ id: "fix", title: "Fix first", topics: [], empty: "Nothing to fix" }} limit={3} />);
		assert.equal(document.querySelector('[data-slot="brief-empty"]')!.textContent, "Nothing to fix");
		assert.equal(document.querySelectorAll('[data-slot="course-topic-row"]').length, 0);
	});
});

describe("the mistake line", () => {
	it("names the topic, gives the sentence, and opens the topic's page", () => {
		const mistake = briefMistake(briefAnswers(viewOf(course())))!;
		const document = render(<BriefMistake mistake={mistake} />);
		const link = document.querySelector('[data-slot="brief-mistake"]')!;
		assert.equal(link.getAttribute("href"), mistake.row.href);
		assert.equal(link.textContent, "Linear independence, a mistake to fix: Treats pairwise non-parallel vectors as independent");
	});
});
