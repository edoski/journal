/**
 * The topic page's hybrid candidate: the history and the lesson map side
 * by side, each in a bounded pane, the page's action left to the composer
 * foot. The eigen and determinant plans and Rank's record are the seeded
 * demo's own (fixtures/topic), read through the topic read's parsers.
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, ChatRecord } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";
import type { SessionPlan } from "../src/core/contracts/topic.ts";
import { sessionPlanOf, topicRecordOf } from "../src/server/topic.ts";
import { topicFacts, type TopicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { hybridMarks, mapLessonAtFirst, nextSteps } from "../components/unit-inbox/topic-page/hybrid/hybrid-facts.ts";
import { HybridTopic } from "../components/unit-inbox/topic-page/hybrid/hybrid-topic.tsx";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "topic");
const fixture = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf-8"));

const TODAY = "2026-11-08";
const WORKSPACE = "/study/linalg";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: handle as TopicHandle, title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const RANK = topic("rank", { title: "Rank and the column space", level: "assisted", introduced: "2026-10-30", review: { kind: "due", date: "2026-11-05", overdue: 3 }, tasks: ["sheet-4"] });
const EIGEN = topic("eigen", { title: "Eigenvalues and eigenvectors" });
const DET = topic("determinant", { title: "Determinants as volume scaling", level: "assisted", introduced: "2026-11-02" });
const MAP: CourseMap = {
	workspace: WORKSPACE,
	title: "Linear Algebra",
	today: TODAY,
	revision: 13,
	exam: null,
	current: "rank" as TopicHandle,
	focus: "sheet-4",
	tasks: [{ key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: "Part (c)" }],
	topics: [RANK, EIGEN, DET],
	edges: [],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, lastActiveDaysAgo: 0 };

function chat(id: string, title: string, updatedAt: string, over: Partial<ChatListItem> = {}): ChatListItem {
	return { id, title, createdAt: updatedAt, updatedAt, kind: "teach", messageCount: 6, phase: "teach", pendingQuestion: false, pendingProblem: false, course: { workspace: WORKSPACE, title: "Linear Algebra" }, topics: [], busy: false, compacting: false, ...over };
}

const EIGEN_PLAN = sessionPlanOf(fixture("chat_demo_eigen.json") as ChatRecord) as SessionPlan;
const DET_PLAN = sessionPlanOf(fixture("chat_demo_det.json") as ChatRecord) as SessionPlan;
const EIGEN_LESSON = chat("chat_demo_eigen", "Eigenvalues and eigenvectors", "2026-11-08T08:19:40.000Z", { pendingQuestion: true, topics: ["eigen"] });
const EIGEN_EARLIER = chat("chat_eigen_before", "A first look", "2026-11-06T15:00:00.000Z", { topics: ["eigen"] });
const DET_LESSON = chat("chat_demo_det", "Determinants as volume scaling", "2026-11-07T10:00:00.000Z", { topics: ["determinant"] });
const RANK_SESSIONS = [
	chat("chat_demo_rank", "Rank practice", "2026-11-08T07:54:30.000Z", { kind: "practice", pendingProblem: true, topics: ["rank"] }),
	chat("chat_demo_rank_take2", "Rank, second pass", "2026-11-03T14:32:01.000Z", { topics: ["rank"] }),
];
const RANK_RECORD = topicRecordOf(fixture("show.rank+task.json"), "rank", ["sheet-4"]);

const factsOf = (t: CourseMapTopic, sessions: ChatListItem[], plans: SessionPlan[] = [], record = null as TopicFacts["attempts"] extends never ? never : Parameters<typeof topicFacts>[0]["read"] extends infer R ? (R extends { record: infer Rec } ? Rec : never) : never): TopicFacts =>
	topicFacts({ course: COURSE, topic: t, sessions, read: { record, plans } });
const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
const page = (facts: TopicFacts, onAct?: () => void) => render(<HybridTopic facts={facts} busy={false} onAct={onAct} onTask={() => {}} />);

describe("the hybrid's facts", () => {
	it("shows at first the lesson the page's action opens, though a newer lesson planned too", () => {
		const facts = factsOf(EIGEN, [EIGEN_LESSON, EIGEN_EARLIER], [EIGEN_PLAN, { ...DET_PLAN, id: "chat_eigen_before" }]);
		assert.equal(mapLessonAtFirst(facts.sessions, facts.action), "chat_demo_eigen");
	});

	it("shows at first the newest lesson that planned when the action opens none, and nothing when none planned", () => {
		const facts = factsOf(DET, [DET_LESSON], [DET_PLAN]);
		assert.equal(facts.action.kind, "continue");
		assert.equal(mapLessonAtFirst(facts.sessions, facts.action), "chat_demo_det");
		const rank = factsOf(RANK, RANK_SESSIONS, [], RANK_RECORD);
		assert.equal(mapLessonAtFirst(rank.sessions, rank.action), null);
	});

	it("marks Next on the steps that rest on the one the lesson stopped on, and nowhere when it stopped on a last step", () => {
		const titleOf = (plan: SessionPlan, ids: Iterable<string>) => [...ids].map((id) => plan.tree.nodes.find((node) => node.id === id)!.title);
		assert.deepEqual(titleOf(EIGEN_PLAN, nextSteps(EIGEN_PLAN)), ["An eigenbasis makes A diagonal"]);
		assert.deepEqual([...nextSteps(DET_PLAN)], []);
		assert.deepEqual([...nextSteps({ ...EIGEN_PLAN, current: null })], []);
		const marks = hybridMarks(EIGEN_PLAN, true);
		assert.deepEqual(
			[...marks].filter(([, mark]) => mark.tag || mark.status !== "upcoming").map(([id, mark]) => [titleOf(EIGEN_PLAN, [id])[0], mark.status, mark.tag]),
			[
				["The eigen-equation Av = λv", "visited", null],
				["Computing a 2×2 spectrum", "current", null],
				["An eigenbasis makes A diagonal", "upcoming", "Next"],
			],
		);
		assert.equal(hybridMarks(DET_PLAN, false).get(DET_PLAN.current!)!.tag, "Left off here");
	});
});

describe("the hybrid page drawn", () => {
	it("draws the history and the shown lesson's map side by side, with no button in the head when the composer holds the action", () => {
		const document = page(factsOf(EIGEN, [EIGEN_LESSON, EIGEN_EARLIER], [EIGEN_PLAN, { ...DET_PLAN, id: "chat_eigen_before" }]));
		assert.equal(document.querySelector('[data-testid="unit-page"]')!.getAttribute("data-topic-candidate"), "hybrid");
		assert.equal(document.querySelector('[data-testid="topic-action"]'), null);
		const panes = document.querySelector('[data-slot="topic-panes"]')!;
		assert.deepEqual([...panes.children].map((pane) => pane.getAttribute("data-slot")), ["topic-history", "topic-lesson-map"]);
		const steps = [...document.querySelectorAll('[data-slot="topic-step"]')];
		assert.equal(steps.length, 7);
		assert.ok(steps.every((step) => step.getAttribute("href") === "/chat/chat_demo_eigen"));
		assert.equal(document.querySelector('[data-slot="topic-step-tag"]')!.textContent, "Next");
	});

	it("lists every session as a link to it and gives each lesson that planned the button that puts it on the map, the shown one pressed", () => {
		const document = page(factsOf(EIGEN, [EIGEN_LESSON, EIGEN_EARLIER], [EIGEN_PLAN, { ...DET_PLAN, id: "chat_eigen_before" }]));
		const rows = [...document.querySelectorAll('[data-slot="topic-history-session"]')];
		assert.deepEqual(
			rows.map((row) => [row.querySelector("a")!.getAttribute("href"), row.getAttribute("data-shown"), row.querySelector('[data-slot="topic-map-toggle"]')?.getAttribute("aria-pressed")]),
			[
				["/chat/chat_demo_eigen", "true", "true"],
				["/chat/chat_eigen_before", null, "false"],
			],
		);
		assert.equal(rows[0]!.querySelector('[data-slot="topic-why"]')!.textContent, "Your turn");
		assert.equal(document.querySelectorAll('[data-slot="topic-history"] h2').length, 2);
	});

	it("keeps the steps out of the history and puts attempts on it as plain entries", () => {
		const document = page(factsOf(RANK, RANK_SESSIONS, [], RANK_RECORD));
		assert.equal(document.querySelectorAll('[data-slot="plan-map"]').length, 0);
		const attempts = [...document.querySelectorAll('[data-slot="topic-attempt"]')];
		assert.ok(attempts.length > 0);
		assert.ok(attempts.every((row) => row.querySelector("a, button") === null));
	});

	it("gives the history the whole width when no lesson planned, with no map and no toggle", () => {
		const document = page(factsOf(RANK, RANK_SESSIONS, [], RANK_RECORD));
		assert.equal(document.querySelector('[data-slot="topic-panes"]'), null);
		assert.equal(document.querySelector('[data-slot="topic-lesson-map"]'), null);
		assert.equal(document.querySelectorAll('[data-slot="topic-map-toggle"]').length, 0);
		assert.ok(document.querySelector('[data-slot="topic-history"]'));
	});

	it("keeps the head's button when the page's action is not in the composer", () => {
		const document = page(factsOf(DET, [DET_LESSON], [DET_PLAN]), () => {});
		assert.equal(document.querySelector('[data-testid="topic-action"]')!.textContent, "Continue");
	});

	it("draws only the head when the topic has no session and no attempt", () => {
		const document = page(factsOf(topic("invertibility", { title: "Invertibility" }), []));
		assert.equal(document.querySelector('[data-slot="topic-history"]'), null);
		assert.ok(document.querySelector('[data-slot="topic-head"]'));
	});
});
