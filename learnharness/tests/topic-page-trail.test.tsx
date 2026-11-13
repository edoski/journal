/**
 * The topic page's trail candidate: the topic's sessions and the engine's
 * scored attempts on one dated line, newest first, each lesson carrying
 * its steps. Rank's and the eigen lesson's records are the seeded demo's
 * own (fixtures/topic), read through the topic read's own parsers. Same
 * tsx classic-JSX shim as the other render tests.
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
import type { SessionPlan, TopicAttempt } from "../src/core/contracts/topic.ts";
import { sessionPlanOf, topicRecordOf } from "../src/server/topic.ts";
import { topicFacts, type TopicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { lessonSteps, opensAtFirst, trailDays } from "../components/unit-inbox/topic-page/trail/trail-facts.ts";
import { Trail } from "../components/unit-inbox/topic-page/trail/trail.tsx";
import { TrailTopic } from "../components/unit-inbox/topic-page/trail/trail-topic.tsx";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "topic");
const fixture = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf-8"));

const TODAY = "2026-11-08";
const WORKSPACE = "/study/linalg";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: handle as TopicHandle, title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const RANK = topic("rank", {
	title: "Rank and the column space",
	level: "assisted",
	introduced: "2026-10-30",
	review: { kind: "due", date: "2026-11-05", overdue: 3 },
	weak: true,
	signals: { ...QUIET, gap: "Counts nonzero entries instead of pivots" },
	tasks: ["sheet-4"],
});
const SPAN = topic("span", { title: "Span", level: "retained", introduced: "2026-10-16", review: { kind: "due", date: "2026-10-29", overdue: 10 } });
const EIGEN = topic("eigen", { title: "Eigenvalues and eigenvectors" });
const INVERTIBILITY = topic("invertibility", { title: "Invertibility" });
const CRAMER = topic("cramer", { title: "Cramer's rule" });
const MAP: CourseMap = {
	workspace: WORKSPACE,
	title: "Linear Algebra",
	today: TODAY,
	revision: 13,
	exam: null,
	current: "rank" as TopicHandle,
	focus: "sheet-4",
	tasks: [{ key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: "Part (c)" }],
	topics: [RANK, SPAN, EIGEN, INVERTIBILITY, CRAMER],
	edges: [],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, lastActiveDaysAgo: 0 };

function chat(id: string, title: string, updatedAt: string, over: Partial<ChatListItem> = {}): ChatListItem {
	return {
		id,
		title,
		createdAt: updatedAt,
		updatedAt,
		kind: "teach",
		messageCount: 6,
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

/** Rank's three seeded sessions, newest first, and its two seeded attempts. */
const RANK_SESSIONS = [
	chat("chat_demo_rank", "Rank practice", "2026-11-08T07:54:30.000Z", { kind: "practice", pendingProblem: true, topics: ["rank"] }),
	chat("chat_demo_rank_take2", "Rank, second pass", "2026-11-03T14:32:01.000Z", { topics: ["rank"] }),
	chat("chat_demo_rank_take1", "Rank and the column space", "2026-10-30T16:45:01.000Z", { topics: ["rank"] }),
];
const RANK_RECORD = topicRecordOf(fixture("show.rank+task.json"), "rank", ["sheet-4"]);
const EIGEN_PLAN = sessionPlanOf(fixture("chat_demo_eigen.json") as ChatRecord) as SessionPlan;
const DET_PLAN = sessionPlanOf(fixture("chat_demo_det.json") as ChatRecord) as SessionPlan;
const EIGEN_LESSON = chat("chat_demo_eigen", "Eigenvalues and eigenvectors", "2026-11-08T08:19:40.000Z", { pendingQuestion: true, topics: ["eigen"] });

const attempt = (id: string, date: string, over: Partial<TopicAttempt> = {}): TopicAttempt => ({
	id,
	date,
	recorded: `${date}T17:00:00.000Z`,
	result: "correct",
	unaided: true,
	sure: null,
	chose: null,
	text: `Attempt ${id}`,
	...over,
});

const factsOf = (t: CourseMapTopic, sessions: ChatListItem[] = [], read: Parameters<typeof topicFacts>[0]["read"] = null): TopicFacts =>
	topicFacts({ course: COURSE, topic: t, sessions, read });
const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
const page = (facts: TopicFacts) => render(<TrailTopic facts={facts} busy={false} onAct={() => {}} onTask={() => {}} />);
const line = (facts: TopicFacts) => trailDays(facts.sessions, facts.attempts, facts.today);

describe("the trail's days", () => {
	it("put Rank's sessions and attempts on three days, newest first, each session before the attempts of its day", () => {
		const days = line(factsOf(RANK, RANK_SESSIONS, { record: RANK_RECORD, plans: [] }));
		assert.deepEqual(
			days.map((day) => [day.label, day.sessions.map((entry) => entry.chat.title), day.attempts.map((a) => a.text)]),
			[
				["Today", ["Rank practice"], []],
				["Tue 3 Nov", ["Rank, second pass"], ["Row-reduced a 3x3 matrix and counted pivots, slipping once on a sign"]],
				["Fri 30 Oct", ["Rank and the column space"], ["Gave rank 3 for a 3x4 matrix whose third row is the sum of the first two"]],
			],
		);
	});

	it("keep a day that has only attempts and a day that has only a session", () => {
		const sessions = [chat("chat_a", "A lesson", "2026-11-07T10:00:00.000Z", { topics: ["span"] })];
		const days = line(factsOf(SPAN, sessions, { record: { attempts: [attempt("o9", "2026-11-05")], tasks: [] }, plans: [] }));
		assert.deepEqual(
			days.map((day) => [day.label, day.sessions.length, day.attempts.length]),
			[
				["Yesterday", 1, 0],
				["Thu 5 Nov", 0, 1],
			],
		);
	});

	it("order a day's sessions by their last message and its attempts by when the engine recorded them, then by id", () => {
		const sessions = [
			chat("chat_early", "Early", "2026-11-06T08:00:00.000Z", { topics: ["span"] }),
			chat("chat_late", "Late", "2026-11-06T20:00:00.000Z", { topics: ["span"] }),
		];
		const attempts = [
			attempt("o9", "2026-11-06", { recorded: "2026-11-06T09:00:00.000Z" }),
			attempt("o12", "2026-11-06", { recorded: "2026-11-06T18:00:00.000Z" }),
			attempt("o10", "2026-11-06", { recorded: "2026-11-06T09:00:00.000Z" }),
		];
		const [day] = trailDays(factsOf(SPAN, sessions).sessions, attempts, TODAY);
		assert.deepEqual(day!.sessions.map((entry) => entry.chat.title), ["Late", "Early"]);
		assert.deepEqual(day!.attempts.map((a) => a.id), ["o12", "o10", "o9"]);
	});

	it("open at first the steps of the session the page's action opens, and no other", () => {
		assert.equal(opensAtFirst(factsOf(EIGEN, [EIGEN_LESSON]).action), "chat_demo_eigen");
		assert.equal(opensAtFirst(factsOf(EIGEN, [{ ...EIGEN_LESSON, pendingQuestion: false, busy: true }]).action), "chat_demo_eigen");
		assert.equal(opensAtFirst(factsOf(SPAN).action), null);
	});

	it("give a lesson's steps in teaching order with Now on the step its newest question was about and Next after it", () => {
		const steps = lessonSteps(EIGEN_PLAN);
		assert.equal(steps.length, 7);
		assert.deepEqual(
			steps.filter((step) => step.status !== "upcoming" || step.next).map((step) => [step.title, step.status, step.next]),
			[
				["The eigen-equation Av = λv", "visited", false],
				["Computing a 2×2 spectrum", "current", false],
				["An eigenbasis makes A diagonal", "upcoming", true],
			],
		);
	});
});

describe("the trail drawn", () => {
	it("says how each attempt went for a screen reader, with the one thing worth saying about it", () => {
		const document = page(factsOf(RANK, RANK_SESSIONS, { record: RANK_RECORD, plans: [] }));
		const attempts = [...document.querySelectorAll('[data-slot="topic-attempt"]')];
		assert.deepEqual(
			attempts.map((row) => [row.getAttribute("data-result"), row.querySelector("svg")!.getAttribute("aria-label"), row.textContent]),
			[
				["partly", "Partly right", "Row-reduced a 3x3 matrix and counted pivots, slipping once on a signWith a hint"],
				["missed", "Missed", "Gave rank 3 for a 3x4 matrix whose third row is the sum of the first two"],
			],
		);
		assert.equal(attempts[0]!.tagName, "LI");
		assert.equal(attempts[0]!.querySelector("a, button"), null);
	});

	it("puts the session to resume first on the line, saying it is his turn, and keeps only the open task as a pick-up row", () => {
		const document = page(factsOf(RANK, RANK_SESSIONS, { record: RANK_RECORD, plans: [] }));
		assert.equal(document.querySelectorAll('[data-testid="topic-action"]').length, 1);
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="topic-pickups"] [data-slot="topic-pickup"]')].map((row) => row.getAttribute("data-kind")),
			["task"],
		);
		const sessions = [...document.querySelectorAll('[data-slot="topic-trail"] [data-testid="unit-page-session"]')];
		assert.deepEqual(
			sessions.map((row) => [row.getAttribute("href"), row.textContent]),
			[
				["/chat/chat_demo_rank", "Rank practiceYour turn"],
				["/chat/chat_demo_rank_take2", "Rank, second pass"],
				["/chat/chat_demo_rank_take1", "Rank and the column space"],
			],
		);
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="topic-trail"] h2')].map((h) => h.textContent),
			["Today", "Tue 3 Nov", "Fri 30 Oct"],
		);
	});

	it("shows the steps of the lesson to resume and keeps another lesson's closed behind its own chevron", () => {
		const det = chat("chat_demo_det", "Determinants as volume scaling", "2026-11-07T16:45:00.000Z", { topics: ["eigen"] });
		const document = page(factsOf(EIGEN, [EIGEN_LESSON, det], { record: null, plans: [EIGEN_PLAN, DET_PLAN] }));
		const toggles = [...document.querySelectorAll('[data-slot="topic-steps-toggle"]')];
		assert.deepEqual(
			toggles.map((toggle) => [toggle.getAttribute("aria-label"), toggle.getAttribute("aria-expanded")]),
			[
				["Hide this lesson's steps", "true"],
				["Show this lesson's steps", "false"],
			],
		);
		const maps = [...document.querySelectorAll('[data-slot="plan-map"]')];
		assert.equal(maps.length, 1);
		assert.equal(maps[0]!.querySelectorAll("li").length, 7);
		assert.match(maps[0]!.querySelector('[data-status="current"]')!.textContent!, /Computing a 2×2 spectrum.*Now/);
	});

	it("says where a lesson nobody is in left off, not Now", () => {
		const det = chat("chat_demo_det", "Determinants as volume scaling", "2026-11-07T16:45:00.000Z", { topics: ["eigen"] });
		const facts = factsOf(EIGEN, [det], { record: null, plans: [DET_PLAN] });
		const document = render(<Trail days={trailDays(facts.sessions, facts.attempts, facts.today)} opensAtFirst="chat_demo_det" titleOf={(h) => h} />);
		const current = document.querySelector('[data-slot="plan-map"] [data-status="current"]')!.textContent!;
		assert.match(current, /Left off here$/);
		assert.doesNotMatch(current, /Now/);
	});

	it("puts a session dated after the engine's day under the one Today", () => {
		const later = chat("chat_later", "Rank, a later look", "2026-11-12T10:00:00.000Z", { topics: ["rank"] });
		const facts = factsOf(RANK, [later, ...RANK_SESSIONS], { record: RANK_RECORD, plans: [] });
		assert.deepEqual(
			line(facts).map((day) => day.label),
			["Today", "Tue 3 Nov", "Fri 30 Oct"],
		);
	});

	it("keeps the sixth day and older behind Earlier", () => {
		const attempts = ["2026-11-07", "2026-11-05", "2026-11-03", "2026-11-01", "2026-10-30", "2026-10-28"].map((date, i) => attempt(`o${20 - i}`, date));
		const document = render(<Trail days={trailDays([], attempts, TODAY)} opensAtFirst={null} titleOf={(h) => h} />);
		assert.deepEqual(
			[...document.querySelectorAll("h2")].map((h) => h.textContent),
			["Yesterday", "Thu 5 Nov", "Tue 3 Nov", "Sun 1 Nov", "Fri 30 Oct"],
		);
		const earlier = document.querySelector('[data-slot="topic-earlier"]')!;
		assert.equal(earlier.textContent, "Earlier");
		assert.equal(earlier.getAttribute("aria-expanded"), "false");
		assert.equal(document.querySelectorAll('[data-slot="topic-attempt"]').length, 5);
	});

	it("draws no line for a topic with no session and no attempt", () => {
		for (const t of [INVERTIBILITY, CRAMER]) {
			const document = page(factsOf(t, [], { record: { attempts: [], tasks: [] }, plans: [] }));
			assert.equal(document.querySelector('[data-slot="topic-trail"]'), null, t.handle);
			assert.equal(document.querySelectorAll('[data-testid="topic-action"]').length, 1, t.handle);
		}
	});
});
