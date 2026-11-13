/**
 * The topic page's `steps` candidate: the tab per planned lesson and its
 * words, the plan in the topic map's geometry, the marks the lesson's own
 * Plan list wears, and the page drawing the map only where a lesson
 * planned. Seeded plans are the demo's own session records
 * (fixtures/topic). Same tsx classic-JSX shim as the other render tests.
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
import { derivePlanStatusesLh } from "../src/core/contracts/plan.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";
import type { SessionPlan } from "../src/core/contracts/topic.ts";
import { topicFacts, type TopicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { lessonWords, planTabs, stepMarks, stepsLayout } from "../components/unit-inbox/topic-page/steps/steps-facts.ts";
import { StepsMap } from "../components/unit-inbox/topic-page/steps/steps-map.tsx";
import { StepsTopic } from "../components/unit-inbox/topic-page/steps/steps-topic.tsx";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "topic");
/** A seeded session's plan, derived from its transcript as the topic read derives it. */
function seededPlan(id: string): SessionPlan {
	const record = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${id}.json`), "utf8")) as ChatRecord;
	const { current, visited } = derivePlanStatusesLh(record.tree!, record.messages);
	return { id, tree: { nodes: record.tree!.nodes, edges: record.tree!.edges }, current, visited: [...visited] };
}
const EIGEN_PLAN = seededPlan("chat_demo_eigen");
const DET_PLAN = seededPlan("chat_demo_det");

const TODAY = "2026-11-08";
const WORKSPACE = "/study/linalg";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 };
function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: handle as TopicHandle, title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}
const EIGEN = topic("eigen", { title: "Eigenvalues and eigenvectors" });
const DET = topic("determinant", { title: "Determinants", level: "assisted", introduced: "2026-11-07", review: { kind: "due", date: "2026-11-08", overdue: 0 } });
const RANK = topic("rank", { title: "Rank and the column space", level: "assisted", introduced: "2026-10-30" });
const MAP: CourseMap = { workspace: WORKSPACE, title: "Linear Algebra", today: TODAY, revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [EIGEN, DET, RANK], edges: [] };
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };

function chat(id: string, over: Partial<ChatListItem> = {}): ChatListItem {
	return {
		id,
		title: id,
		createdAt: "2026-11-01T09:00:00.000Z",
		updatedAt: "2026-11-08T08:00:00.000Z",
		kind: "teach",
		messageCount: 4,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		course: { workspace: WORKSPACE, title: "Linear Algebra" },
		topics: [],
		busy: false,
		compacting: false,
		...over,
	};
}
const factsOf = (t: CourseMapTopic, sessions: ChatListItem[], plans: SessionPlan[]): TopicFacts => topicFacts({ course: COURSE, topic: t, sessions, read: { record: null, plans } });

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;

describe("a lesson's tab", () => {
	it("is named by its day against the engine's", () => {
		assert.equal(lessonWords("2026-11-08", TODAY), "Today's lesson");
		assert.equal(lessonWords("2026-11-07", TODAY), "Yesterday's lesson");
		assert.equal(lessonWords("2026-11-03", TODAY), "Lesson of Tue 3 Nov");
		assert.equal(lessonWords("2026-11-03", TODAY, "practice"), "Practice of Tue 3 Nov");
	});

	it("comes only for a session with a plan, newest first, and two on one day add their titles", () => {
		const sessions = [
			chat("chat_late", { title: "Rank, second pass", updatedAt: "2026-11-03T16:00:00.000Z" }),
			chat("chat_none", { updatedAt: "2026-11-03T12:00:00.000Z" }),
			chat("chat_early", { title: "Rank and the column space", updatedAt: "2026-11-03T09:00:00.000Z" }),
		];
		const facts = factsOf(RANK, sessions, [
			{ ...DET_PLAN, id: "chat_late" },
			{ ...DET_PLAN, id: "chat_early" },
		]);
		const { tabs, opens } = planTabs(facts.sessions, facts.pickups, TODAY);
		assert.deepEqual(
			tabs.map((tab) => [tab.id, tab.label]),
			[
				["chat_late", "Lesson of Tue 3 Nov, Rank, second pass"],
				["chat_early", "Lesson of Tue 3 Nov, Rank and the column space"],
			],
		);
		assert.equal(opens, "chat_late");
	});

	it("opens on the lesson to pick up when it has a plan, though a newer one has a plan too", () => {
		const sessions = [chat("chat_new", { updatedAt: "2026-11-08T09:00:00.000Z" }), chat("chat_demo_eigen", { pendingQuestion: true, updatedAt: "2026-11-07T09:00:00.000Z" })];
		const facts = factsOf(EIGEN, sessions, [{ ...DET_PLAN, id: "chat_new" }, EIGEN_PLAN]);
		const { tabs, opens } = planTabs(facts.sessions, facts.pickups, TODAY);
		assert.deepEqual(
			tabs.map((tab) => tab.label),
			["Today's lesson", "Yesterday's lesson"],
		);
		assert.equal(opens, "chat_demo_eigen");
	});

	it("is absent with no plan, and a plan with no steps counts as none", () => {
		const facts = factsOf(RANK, [chat("chat_a")], [{ id: "chat_a", tree: { nodes: [], edges: [] }, current: null, visited: [] }]);
		assert.deepEqual(planTabs(facts.sessions, facts.pickups, TODAY), { tabs: [], opens: null });
	});
});

describe("the plan in the topic map's geometry", () => {
	it("lays the Eigenvalues lesson out in six layers, two steps in the fourth, seven routes", () => {
		const { layout, needs } = stepsLayout(EIGEN_PLAN);
		assert.equal(layout.layers.length, 6);
		assert.deepEqual(
			layout.layers.map((layer) => layer.length),
			[1, 1, 1, 2, 1, 1],
		);
		assert.deepEqual([...layout.layers[3]!].sort(), ["charpoly", "eigenspace"]);
		assert.equal(layout.routes.length, 7);
		assert.equal(needs.length, 7);
	});

	it("leaves out an edge to a missing step, a repeated edge and one that would close a loop", () => {
		const plan: SessionPlan = {
			id: "chat_x",
			tree: {
				nodes: [
					{ id: "a", title: "A" },
					{ id: "b", title: "B" },
					{ id: "c", title: "C" },
					{ id: "a", title: "A again" },
				],
				edges: [
					{ from: "a", to: "b" },
					{ from: "b", to: "c" },
					{ from: "a", to: "b" },
					{ from: "c", to: "a" },
					{ from: "b", to: "b" },
					{ from: "ghost", to: "c" },
				],
			},
			current: null,
			visited: [],
		};
		const { layout, needs } = stepsLayout(plan);
		assert.deepEqual(
			needs.map((need) => (need.kind === "needs" ? `${need.prerequisite}>${need.topic}` : "")),
			["a>b", "b>c"],
		);
		assert.equal(layout.topics.size, 3);
		assert.equal(layout.layers.length, 3);
	});
});

describe("the marks on a lesson's steps", () => {
	it("ring the step the Eigenvalues lesson waits on, with no tag since its pick-up row says so, and dot the one asked about before", () => {
		const marks = stepMarks(EIGEN_PLAN, true);
		assert.deepEqual(marks.get("compute"), { status: "current", tag: null });
		assert.deepEqual(marks.get("equation"), { status: "visited", tag: null });
		assert.deepEqual(marks.get("maps"), { status: "upcoming", tag: null });
	});

	it("say where the finished Determinants lesson left off and nothing more", () => {
		const marks = stepMarks(DET_PLAN, false);
		assert.deepEqual(marks.get("product"), { status: "current", tag: "Left off here" });
		assert.deepEqual(
			[...marks.values()].filter((mark) => mark.status === "visited"),
			[],
		);
	});
});

describe("the steps map", () => {
	it("draws each step as a link to the lesson and each edge as a need, as tall as the plan at full size", () => {
		const document = render(<StepsMap plan={EIGEN_PLAN} waits href="/chat/chat_demo_eigen" lesson="Today's lesson" />);
		const steps = [...document.querySelectorAll('[data-slot="topic-step"]')];
		assert.equal(steps.length, 7);
		assert.equal(document.querySelectorAll('[data-slot="course-map-need"]').length, 7);
		assert.ok(steps.every((step) => step.getAttribute("href") === "/chat/chat_demo_eigen"));
		const current = steps.find((step) => step.getAttribute("data-status") === "current")!;
		assert.equal(current.getAttribute("aria-label"), "Computing a 2×2 spectrum. Your turn. Opens Today's lesson");
		assert.equal(current.getAttribute("aria-current"), "step");
		assert.match(current.getAttribute("aria-description")!, /^Rests on /);
		assert.equal(document.querySelector('[data-slot="topic-step-tag"]'), null);
		assert.equal(steps.filter((step) => step.getAttribute("tabindex") === "0").length, 1);
		assert.equal(current.getAttribute("tabindex"), "0");
		const { layout } = stepsLayout(EIGEN_PLAN);
		assert.equal((document.querySelector('[data-slot="topic-steps"]') as HTMLElement).style.height, `${layout.height + 104}px`, "the whole plan, room and tag included");
	});

	it("tags the step a lesson left off on when it does not wait on him", () => {
		const document = render(<StepsMap plan={DET_PLAN} waits={false} href="/chat/chat_demo_det" lesson="Yesterday's lesson" />);
		assert.equal(document.querySelector('[data-slot="topic-step-tag"]')!.textContent, "Left off here");
	});
});

describe("the steps page", () => {
	const page = (facts: TopicFacts) => render(<StepsTopic facts={facts} busy={false} onAct={() => {}} onTask={() => {}} />);

	it("names the one planned lesson over its map, under the pick-up row, with no tab to press", () => {
		const document = page(factsOf(EIGEN, [chat("chat_demo_eigen", { pendingQuestion: true, topics: ["eigen"] })], [EIGEN_PLAN]));
		assert.equal(document.querySelectorAll('[data-slot="topic-lesson-tab"]').length, 0);
		assert.equal(document.querySelector('[data-slot="topic-lessons"] h2')!.textContent, "Today's lesson");
		assert.equal(document.querySelectorAll('[data-slot="topic-steps"]').length, 1);
		assert.equal(document.querySelectorAll('[data-testid="topic-action"]').length, 1);
		const order = [...document.querySelectorAll('[data-slot="topic-head"], [data-slot="topic-pickups"], [data-slot="topic-steps"]')].map((el) => el.getAttribute("data-slot"));
		assert.deepEqual(order, ["topic-head", "topic-pickups", "topic-steps"]);
	});

	it("draws a tab per planned lesson when there are several", () => {
		const sessions = [chat("chat_demo_det", { topics: ["determinant"], updatedAt: "2026-11-07T16:00:00.000Z" }), chat("chat_old", { topics: ["determinant"], updatedAt: "2026-11-03T10:00:00.000Z" })];
		const document = page(factsOf(DET, sessions, [DET_PLAN, { ...DET_PLAN, id: "chat_old" }]));
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="topic-lesson-tab"]')].map((tab) => tab.textContent),
			["Yesterday's lesson", "Lesson of Tue 3 Nov"],
		);
	});

	it("draws no tabs and no map when no lesson planned", () => {
		const document = page(factsOf(RANK, [chat("chat_demo_rank", { kind: "practice", pendingProblem: true, topics: ["rank"] })], []));
		assert.equal(document.querySelector('[data-slot="topic-lessons"]'), null);
		assert.equal(document.querySelector('[data-slot="topic-steps"]'), null);
		assert.equal(document.querySelectorAll('[data-testid="topic-action"]').length, 1);
	});
});
