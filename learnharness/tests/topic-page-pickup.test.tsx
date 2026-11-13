/**
 * The hybrid topic page's Pick up options: the history sorted into Now,
 * Next, Scheduled and Earlier, every row of the action table (`topicAction`)
 * held by Now, and each option's order on the page. The eigen and
 * determinant plans and Rank's record are the seeded demo's own
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
import type { StudyCourse } from "../src/core/contracts/study.ts";
import type { SessionPlan, TopicRecord } from "../src/core/contracts/topic.ts";
import { sessionPlanOf, topicRecordOf } from "../src/server/topic.ts";
import { topicFacts, type TopicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { HybridTopic } from "../components/unit-inbox/topic-page/hybrid/hybrid-topic.tsx";
import { pickupSections } from "../components/unit-inbox/topic-page/pickup/pickup-facts.ts";
import { PICKUP_PANES } from "../components/unit-inbox/topic-page/pickup/pickup-options.ts";
import { PICKUP_OPTIONS } from "../components/design-variant.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "topic");
const fixture = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf-8"));

const TODAY = "2026-11-08";
const WORKSPACE = "/study/linalg";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 };

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: handle as TopicHandle, title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const EIGEN = topic("eigen", { title: "Eigenvalues and eigenvectors" });
const SPAN = topic("span", { title: "Span", level: "retained", introduced: "2026-10-16", review: { kind: "due", date: "2026-11-06", overdue: 2 } });
const RANK = topic("rank", { title: "Rank and the column space", level: "assisted", introduced: "2026-10-30", tasks: ["sheet-4", "sheet-5"] });
const INVERTIBILITY = topic("invertibility", { title: "Invertibility" });
const DET = topic("determinant", { title: "Determinants as volume scaling", level: "assisted", introduced: "2026-11-02" });
const VECTORS = topic("vectors", { title: "Vectors", level: "retained", introduced: "2026-10-01", review: { kind: "scheduled", date: "2026-11-13" } });
const MAP: CourseMap = {
	workspace: WORKSPACE,
	title: "Linear Algebra",
	today: TODAY,
	revision: 13,
	exam: null,
	current: "rank" as TopicHandle,
	focus: "sheet-4",
	tasks: [
		{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" },
		{ key: "sheet-5", title: "Problem sheet 5", step: null },
	],
	topics: [EIGEN, SPAN, RANK, INVERTIBILITY, DET, VECTORS],
	edges: [],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, lastActiveDaysAgo: 0 };

function chat(id: string, title: string, updatedAt: string, over: Partial<ChatListItem> = {}): ChatListItem {
	return { id, title, createdAt: updatedAt, updatedAt, kind: "teach", messageCount: 6, phase: "teach", pendingQuestion: false, pendingProblem: false, course: { workspace: WORKSPACE, title: "Linear Algebra" }, topics: [], busy: false, compacting: false, ...over };
}

const EIGEN_PLAN = sessionPlanOf(fixture("chat_demo_eigen.json") as ChatRecord) as SessionPlan;
const DET_PLAN = sessionPlanOf(fixture("chat_demo_det.json") as ChatRecord) as SessionPlan;
const DET_STOPPED = DET_PLAN.tree.nodes.find((node) => node.id === DET_PLAN.current)!.title;
const RANK_RECORD = topicRecordOf(fixture("show.rank+task.json"), "rank", ["sheet-4"]);

const factsOf = (t: CourseMapTopic, sessions: ChatListItem[] = [], plans: SessionPlan[] = [], record: TopicRecord | null = null): TopicFacts =>
	topicFacts({ course: COURSE, topic: t, sessions, read: { record, plans } });

const EIGEN_LESSON = chat("chat_demo_eigen", "Eigenvalues and eigenvectors", "2026-11-08T08:19:40.000Z", { pendingQuestion: true, topics: ["eigen"] });

/** One topic per row of the action table, in the table's order. */
const ROWS: Array<[string, TopicFacts]> = [
	["resume", factsOf(EIGEN, [EIGEN_LESSON], [EIGEN_PLAN])],
	["open", factsOf(EIGEN, [{ ...EIGEN_LESSON, pendingQuestion: false, busy: true }], [EIGEN_PLAN])],
	["review", factsOf(SPAN)],
	["continue a task", factsOf(RANK, [chat("chat_rank", "Rank, second pass", "2026-11-03T14:32:01.000Z", { topics: ["rank"] })])],
	["start", factsOf(INVERTIBILITY)],
	["continue", factsOf(DET, [chat("chat_demo_det", "Determinants as volume scaling", "2026-11-07T10:00:00.000Z", { topics: ["determinant"] })], [DET_PLAN])],
	["study", factsOf(VECTORS)],
];

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
const page = (option: (typeof PICKUP_OPTIONS)[number], facts: TopicFacts) => render(<HybridTopic facts={facts} busy={false} onAct={() => {}} onTask={() => {}} pane={PICKUP_PANES[option]} />);

/** The pane's sections top to bottom, by label. */
function order(document: Document): string[] {
	const pane = document.querySelector('[data-slot="topic-history"]')!;
	return [...pane.querySelectorAll('[data-slot="pickup-section"]')].map((el) => el.getAttribute("data-section")!);
}

describe("Now", () => {
	it("holds every row of the action table: what waits, the press, the session it opens and where the lesson stands", () => {
		assert.deepEqual(
			ROWS.map(([, facts]) => {
				const { now } = pickupSections(facts);
				return [now.kind, now.words, now.press, now.chat, now.step && `${now.step.lead} ${now.step.title}`, now.detail, now.then];
			}),
			[
				["resume", "Your turn in today's lesson", "Resume", "chat_demo_eigen", "Stopped on Computing a 2×2 spectrum", null, "An eigenbasis makes A diagonal"],
				["open", "The tutor is writing in today's lesson", "Open", "chat_demo_eigen", "Stopped on Computing a 2×2 spectrum", null, "An eigenbasis makes A diagonal"],
				["review", "Review overdue by 2 days", "Review", null, null, null, null],
				["continue", "Problem sheet 4", "Continue", null, null, "Part (c)", null],
				["start", "Not started", "Start", null, null, null, null],
				["continue", "Keep learning", "Continue", null, `Yesterday's lesson stopped on ${DET_STOPPED}`, null, null],
				["study", "Nothing due", "Study", null, null, null, null],
			],
		);
	});

	it("says what waits when the lesson planned nothing", () => {
		const facts = factsOf(RANK, [chat("chat_demo_rank", "Rank practice", "2026-11-08T07:54:30.000Z", { kind: "practice", pendingProblem: true, topics: ["rank"] })]);
		const { now } = pickupSections(facts);
		assert.deepEqual([now.words, now.title, now.step, now.detail], ["Your turn in today's practice", "Rank practice", null, "Problem waiting"]);
	});
});

describe("the sections' order", () => {
	it("puts every other place that waits in Next, most pressing first, and the rest of the history in Earlier", () => {
		const sessions = [
			chat("chat_writing", "Rank, the tutor writes", "2026-11-08T09:00:00.000Z", { busy: true, topics: ["rank"] }),
			chat("chat_practice", "Rank practice", "2026-11-08T08:00:00.000Z", { kind: "practice", pendingProblem: true, topics: ["rank"] }),
			chat("chat_question", "Rank, a question", "2026-11-07T08:00:00.000Z", { pendingQuestion: true, topics: ["rank"] }),
			chat("chat_done", "Rank, second pass", "2026-11-03T14:32:01.000Z", { topics: ["rank"] }),
		];
		const solid = topic("rank", { ...RANK, level: "retained", review: { kind: "due", date: "2026-11-08", overdue: 0 } });
		const { now, next, scheduled, earlier } = pickupSections(factsOf(solid, sessions, [], RANK_RECORD));
		assert.equal(now.chat, "chat_practice");
		assert.deepEqual(
			next.map((item) => (item.kind === "session" ? item.entry.chat.id : item.kind === "task" ? item.key : item.words)),
			["chat_question", "chat_writing", "Review due today", "sheet-4", "sheet-5"],
		);
		assert.equal(scheduled, null);
		assert.deepEqual(earlier.flatMap((day) => day.sessions.map((entry) => entry.chat.id)), ["chat_done"]);
		assert.ok(earlier.some((day) => day.attempts.length > 0));
	});

	it("never offers the task Now continues again in Next", () => {
		const { now, next } = pickupSections(ROWS[3]![1]);
		assert.equal(now.words, "Problem sheet 4");
		assert.deepEqual(next.map((item) => item.kind === "task" && item.key), ["sheet-5"]);
	});

	it("dates only a review the engine set ahead, as Scheduled", () => {
		assert.deepEqual(
			ROWS.map(([, facts]) => pickupSections(facts).scheduled),
			[null, null, null, null, null, null, "Next review Fri 13 Nov"],
		);
	});
});

describe("each option drawn", () => {
	const RICH = factsOf(VECTORS, [
		{ ...EIGEN_LESSON, topics: ["vectors"] },
		chat("chat_other", "Vectors, a question", "2026-11-07T08:00:00.000Z", { pendingQuestion: true, topics: ["vectors"] }),
		chat("chat_old", "Vectors, first pass", "2026-11-02T08:00:00.000Z", { topics: ["vectors"] }),
	], [EIGEN_PLAN]);

	it("orders Now, Next, Scheduled and Earlier, and draws no empty section", () => {
		assert.deepEqual(order(page("sections", RICH)), ["now", "next", "scheduled", "earlier"]);
		const alone = ROWS[4]![1];
		assert.deepEqual(order(page("sections", alone)), ["now"]);
	});

	it("draws every row of the action table as Now, the session it opens as a link and every other press as a button, with no button in the head", () => {
		for (const option of PICKUP_OPTIONS) {
			for (const [name, facts] of ROWS) {
				const document = page(option, facts);
				assert.equal(document.querySelector('[data-testid="topic-action"]'), null, `${option} ${name}: no head button`);
				const now = document.querySelector('[data-slot="pickup-now"]')!;
				assert.equal(now.getAttribute("data-action"), facts.action.kind, `${option} ${name}`);
				const press = now.querySelector('[data-slot="pickup-now-press"]')!;
				if ("chat" in facts.action) assert.equal(press.getAttribute("href"), `/chat/${facts.action.chat.id}`, `${option} ${name}`);
				else assert.equal(press.tagName, "BUTTON", `${option} ${name}`);
			}
		}
	});

	it("keeps the lesson Now opens on the map, its row filled and its map button pressed", () => {
		for (const option of PICKUP_OPTIONS) {
			const document = page(option, ROWS[0]![1]);
			const now = document.querySelector('[data-slot="pickup-now"]')!;
			assert.equal(now.getAttribute("data-shown"), "true", option);
			assert.equal(now.querySelector('[data-slot="topic-map-toggle"]')!.getAttribute("aria-pressed"), "true", option);
			assert.ok(document.querySelector('[data-slot="topic-lesson-map"]'), option);
		}
	});
});
