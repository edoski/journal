/**
 * The hybrid topic page's Pick up sections: the history sorted into Now,
 * Next, Scheduled and Earlier, every row of the action table (`topicAction`)
 * held by Now, and their order on the page. The eigen and
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

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "topic");
const fixture = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf-8"));

const TODAY = "2026-11-08";
const WORKSPACE = "/study/linalg";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };

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
		{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)", updated: null },
		{ key: "sheet-5", title: "Problem sheet 5", step: null, updated: null },
	],
	topics: [EIGEN, SPAN, RANK, INVERTIBILITY, DET, VECTORS],
	edges: [],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };

function chat(id: string, title: string, updatedAt: string, over: Partial<ChatListItem> = {}): ChatListItem {
	return { id, title, createdAt: updatedAt, updatedAt, kind: "teach", messageCount: 6, phase: "teach", pendingQuestion: false, pendingProblem: false, course: { workspace: WORKSPACE, title: "Linear Algebra" }, topics: [], busy: false, compacting: false, ...over };
}

const EIGEN_PLAN = sessionPlanOf(fixture("chat_demo_eigen.json") as ChatRecord) as SessionPlan;
const DET_PLAN = sessionPlanOf(fixture("chat_demo_det.json") as ChatRecord) as SessionPlan;
const DET_STOPPED = DET_PLAN.tree.nodes.find((node) => node.id === DET_PLAN.current)!.title;
const RANK_RECORD = topicRecordOf(fixture("show.rank+task.json"), "rank", ["sheet-4"]);

const factsOf = (t: CourseMapTopic, sessions: ChatListItem[] = [], plans: SessionPlan[] = [], record: TopicRecord | null = null): TopicFacts =>
	topicFacts({ course: COURSE, topic: t, chats: sessions.map((c) => ((c.topics ?? []).includes(t.handle) ? c : { ...c, topics: [...(c.topics ?? []), t.handle] })), read: { record, plans } });

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
const page = (facts: TopicFacts) => render(<HybridTopic facts={facts} busy={false} onAct={() => {}} onTask={() => {}} />);

/** The pane's sections top to bottom, by label. */
function order(document: Document): string[] {
	const pane = document.querySelector('[data-slot="topic-history"]')!;
	return [...pane.querySelectorAll('[data-slot="pickup-section"]')].map((el) => el.getAttribute("data-section")!);
}

describe("Now", () => {
	it("says nothing is planned today, not Nothing due, on a review the plan holds past its due day (round 4)", () => {
		const held = topic("binomial", { title: "Binomial distribution", level: "assisted", introduced: "2026-11-05", review: { kind: "scheduled", date: "2026-11-10", held: { exam: null, since: "2026-11-06" } } });
		const { now, scheduled } = pickupSections(factsOf(held));
		assert.equal(now.words, "Nothing planned today");
		assert.equal(scheduled?.kind, "review");
		const ahead = topic("binomial", { ...held, review: { kind: "scheduled", date: "2026-11-10", held: { exam: null, since: "2026-11-09" } } });
		assert.equal(pickupSections(factsOf(ahead)).now.words, "Nothing due", "a review memory asks for later is not due yet");
	});

	it("holds every row of the action table: what to pick up, where it stands in a few words, the press and the session it opens", () => {
		assert.deepEqual(
			ROWS.map(([, facts]) => {
				const { now } = pickupSections(facts);
				return [now.kind, now.words, now.note, now.press, now.chat];
			}),
			[
				["resume", "Computing a 2×2 spectrum", "Your turn", "Resume", "chat_demo_eigen"],
				["open", "Computing a 2×2 spectrum", "Tutor writing", "Open", "chat_demo_eigen"],
				["review", "2d overdue", null, "Review", null],
				["continue", "Problem sheet 4", "Part (c)", "Continue", null],
				["start", "First lesson", null, "Start", null],
				["continue", DET_STOPPED, "Left off yesterday", "Continue", "chat_demo_det"],
				["study", "Nothing due", null, "Study", null],
			],
		);
	});

	it("names the session when the lesson planned nothing", () => {
		const facts = factsOf(RANK, [chat("chat_demo_rank", "Rank practice", "2026-11-08T07:54:30.000Z", { kind: "practice", pendingProblem: true, topics: ["rank"] })]);
		const { now } = pickupSections(facts);
		assert.deepEqual([now.words, now.note], ["Rank practice", "Your turn"]);
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
			["chat_question", "chat_writing", "Due today", "sheet-4", "sheet-5"],
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

	it("dates a topic not started on its planned first lesson once, under Now, with the courses that come first", () => {
		const later = factsOf(topic("poisson", { title: "Poisson", level: "new", starts: "2026-11-19", startsAfter: ["Linear Algebra"] }));
		const { now, scheduled } = pickupSections(later);
		assert.deepEqual([now.words, now.note], ["First lesson", "Planned Thu 19 Nov, after Linear Algebra's new topics"]);
		assert.equal(scheduled, null, "Scheduled does not say it again");
		assert.equal(page(later).querySelectorAll('[data-slot="pickup-scheduled"]').length, 0);
		assert.equal((page(later).body.textContent ?? "").split("First lesson").length - 1, 1, "First lesson once on the page");
		assert.equal(pickupSections(factsOf(topic("poisson", { level: "new", starts: TODAY }))).now.note, "Planned today");
		assert.equal(pickupSections(factsOf(topic("poisson", { level: "new" }))).now.note, null, "no day when the plan has none");
	});

	it("dates only a review the engine set ahead, as Scheduled", () => {
		assert.deepEqual(
			ROWS.map(([, facts]) => pickupSections(facts).scheduled),
			[null, null, null, null, null, null, { kind: "review", day: "Fri 13 Nov", waits: null }],
		);
	});
});

describe("a topic not started", () => {
	const KERNEL = topic("kernel", { title: "Kernel", level: "attempted", introduced: "2026-11-01", weak: true, signals: { ...QUIET, confidentErrors: 1 } });
	const POISSON = topic("poisson", { title: "Poisson distribution", level: "new", starts: "2026-11-11" });
	const map: CourseMap = {
		...MAP,
		current: "rank" as TopicHandle,
		topics: [VECTORS, SPAN, RANK, KERNEL, POISSON, EIGEN],
		edges: [
			{ kind: "needs", prerequisite: "vectors" as TopicHandle, topic: "span" as TopicHandle },
			{ kind: "needs", prerequisite: "span" as TopicHandle, topic: "rank" as TopicHandle },
			{ kind: "needs", prerequisite: "rank" as TopicHandle, topic: "poisson" as TopicHandle },
			{ kind: "needs", prerequisite: "kernel" as TopicHandle, topic: "poisson" as TopicHandle },
			{ kind: "needs", prerequisite: "poisson" as TopicHandle, topic: "eigen" as TopicHandle },
		],
	};
	const record: TopicRecord = { attempts: [], tasks: [], refs: [{ source: "Blitzstein and Hwang", locator: "Section 4.7" }] };
	const facts = topicFacts({ course: { ...COURSE, map }, topic: POISSON, chats: [], read: { record, plans: [] } });

	it("says why it comes now: what it builds on with where he stands on each, then where it is in his material", () => {
		const { why } = pickupSections(facts);
		assert.deepEqual(
			why?.builds.map((b) => [b.topic.handle, b.standing.words]),
			[
				["rank", "Right with help"],
				["kernel", "Tried, not right yet"],
			],
		);
		assert.deepEqual(why?.refs, [{ source: "Blitzstein and Hwang", locator: "Section 4.7" }]);
		const document = page(facts);
		assert.deepEqual(order(document), ["now", "builds on", "in your material"]);
		const rows = [...document.querySelectorAll('[data-slot="pickup-builds-on"]')];
		assert.deepEqual(
			rows.map((r) => [r.getAttribute("href"), r.querySelector('[data-slot="pickup-builds-on-standing"]')!.textContent]),
			[
				["/unit/L3N0dWR5L2xpbmFsZw/rank", "Right with help"],
				["/unit/L3N0dWR5L2xpbmFsZw/kernel", "Tried, not right yet"],
			],
		);
		assert.equal(document.querySelector('[data-slot="pickup-material"]')!.textContent, "Section 4.7Blitzstein and Hwang");
	});

	it("draws beside it the course map cut to the topic and everything it builds on, near or far", () => {
		assert.deepEqual(facts.buildsMap?.topics.map((t) => t.handle), ["vectors", "span", "rank", "kernel", "poisson"]);
		assert.equal(facts.buildsMap?.current, "rank", "where he is, when it is among them");
		const document = page(facts);
		assert.ok(document.querySelector('[data-slot="topic-panes"] [data-slot="topic-builds-map"]'), "the map column");
		const alone = topicFacts({ course: { ...COURSE, map }, topic: topic("vectors-2", { level: "new" }), chats: [], read: null });
		assert.equal(alone.buildsMap, null);
		assert.equal(page(alone).querySelector('[data-slot="topic-builds-map"]'), null, "a topic that builds on nothing takes the width");
	});

	it("says none of it once a session or the engine has started it", () => {
		const taught = topicFacts({ course: { ...COURSE, map }, topic: { ...POISSON, level: "introduced", introduced: TODAY }, chats: [], read: { record, plans: [] } });
		assert.equal(pickupSections(taught).why, null);
		assert.equal(page(taught).querySelector('[data-slot="topic-builds-map"]'), null);
	});
});

describe("the sections drawn", () => {
	const RICH = factsOf(VECTORS, [
		{ ...EIGEN_LESSON, topics: ["vectors"] },
		chat("chat_other", "Vectors, a question", "2026-11-07T08:00:00.000Z", { pendingQuestion: true, topics: ["vectors"] }),
		chat("chat_old", "Vectors, first pass", "2026-11-02T08:00:00.000Z", { topics: ["vectors"] }),
	], [EIGEN_PLAN]);

	it("orders Now, Next, Scheduled and Earlier, and draws no empty section", () => {
		assert.deepEqual(order(page(RICH)), ["now", "next", "scheduled", "earlier"]);
		const alone = ROWS[4]![1];
		assert.deepEqual(order(page(alone)), ["now"]);
	});

	it("draws every row of the action table as Now, the session it opens as a link and every other press as a button, with no button in the head", () => {
		for (const [name, facts] of ROWS) {
			const document = page(facts);
			assert.equal(document.querySelector('[data-testid="topic-action"]'), null, `${name}: no head button`);
			const now = document.querySelector('[data-slot="pickup-now"]')!;
			assert.equal(now.getAttribute("data-action"), facts.action.kind, name);
			const press = now.querySelector('[data-slot="pickup-now-press"]')!;
			if ("chat" in facts.action) assert.equal(press.getAttribute("href"), `/chat/${facts.action.chat.id}`, name);
			else assert.equal(press.tagName, "BUTTON", name);
		}
	});

	it("says why the scheduled review waits when something holds it, and only then", () => {
		const held = factsOf({ ...VECTORS, review: { kind: "scheduled", date: "2026-12-03", held: { exam: "Probability", since: "2026-10-01" } } });
		assert.deepEqual(pickupSections(held).scheduled, { kind: "review", day: "Thu 3 Dec", waits: "Due since 1 Oct, waits for your Probability exam" });
		const line = page(held).querySelector('[data-slot="pickup-scheduled"]')!;
		assert.equal(line.querySelector('[data-slot="pickup-scheduled-waits"]')!.textContent, "Due since 1 Oct, waits for your Probability exam");
		assert.equal(page(factsOf(VECTORS)).querySelector('[data-slot="pickup-scheduled-waits"]'), null);
	});

	it("keeps the lesson Now opens on the map, its map button pressed, Now itself a plain row with no fill", () => {
		const document = page(ROWS[0]![1]);
		const now = document.querySelector('[data-slot="pickup-now"]')!;
		assert.equal(now.getAttribute("data-shown"), "true");
		assert.doesNotMatch(now.className, /bg-fill-selected|ring-1/, "no box around Now");
		assert.equal(now.querySelector('[data-slot="topic-map-toggle"]')!.getAttribute("aria-pressed"), "true");
		assert.ok(document.querySelector('[data-slot="topic-lesson-map"]'));
	});
});

describe("Earlier", () => {
	it("lists each attempt as its result icon, its sentence and its day, with no help words", () => {
		const facts = factsOf(RANK, [], [], RANK_RECORD);
		assert.ok(facts.attempts.some((attempt) => !attempt.unaided), "the record holds a helped attempt");
		const earlier = page(facts).querySelector('[data-section="earlier"]')!;
		const rows = [...earlier.querySelectorAll('[data-slot="topic-attempt"]')];
		assert.equal(rows.length, facts.attempts.length);
		for (const row of rows) {
			assert.ok(row.querySelector('svg[role="img"]'), "the result icon");
			assert.doesNotMatch(row.textContent!, /With a hint|Sure, but wrong|Mixed up with/);
		}
		assert.ok(earlier.querySelector('[data-slot="topic-history-date"]'));
	});
});
