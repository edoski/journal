/**
 * The topic page's brief candidate: Home's Today for one topic. The head
 * says where he stands and the one thing to do, pick-up rows say where it
 * was left, past sessions are a quiet list, and nothing else is drawn.
 * Same tsx classic-JSX shim and router stub as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";
import type { SessionPlan } from "../src/core/contracts/topic.ts";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { BriefTopic } from "../components/unit-inbox/topic-page/brief/brief-topic.tsx";

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
const VECTORS = topic("vectors", { title: "Vectors", level: "transferred", introduced: "2026-10-16", review: { kind: "scheduled", date: "2026-11-13" } });
const EIGEN = topic("eigen", { title: "Eigenvalues and eigenvectors" });
const DETERMINANT = topic("determinant", { title: "Determinants", level: "assisted", introduced: "2026-11-03", review: { kind: "due", date: "2026-11-04", overdue: 4 } });
const MAP: CourseMap = {
	workspace: WORKSPACE,
	title: "Linear Algebra",
	today: TODAY,
	revision: 13,
	exam: null,
	current: "rank" as TopicHandle,
	focus: "sheet-4",
	tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" }],
	topics: [RANK, SPAN, VECTORS, EIGEN, DETERMINANT],
	edges: [],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };

let ids = 0;
function chat(over: Partial<ChatListItem> = {}): ChatListItem {
	ids += 1;
	return {
		id: `chat_${ids}`,
		title: `Session ${ids}`,
		createdAt: "2026-11-01T09:00:00.000Z",
		updatedAt: "2026-11-05T10:00:00.000Z",
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

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };

function page(t: CourseMapTopic, sessions: ChatListItem[] = [], { plans = [] as SessionPlan[], busy = false } = {}) {
	const facts = topicFacts({ course: COURSE, topic: t, sessions, read: { record: null, plans } });
	const html = renderToStaticMarkup(
		<AppRouterContext.Provider value={router as never}>
			<BriefTopic facts={facts} busy={busy} onAct={() => {}} onTask={() => {}} />
		</AppRouterContext.Provider>,
	);
	const root = parseHTML(`<html><body>${html}</body></html>`).document.querySelector('[data-testid="unit-page"]')!;
	const action = root.querySelectorAll('[data-testid="topic-action"]');
	assert.equal(action.length, 1, "one action on the page");
	assert.equal(root.getAttribute("data-topic-candidate"), "brief");
	return {
		root,
		action: [action[0]!.getAttribute("data-action"), action[0]!.textContent],
		pickups: [...root.querySelectorAll('[data-slot="topic-pickup"]')].map((row) => row.textContent),
		sessions: [...root.querySelectorAll('[data-testid="unit-page-session"]')].map((row) => row.textContent),
	};
}

describe("the brief topic page", () => {
	it("says where he stands and what to do, then stops, when there is no place to pick up", () => {
		const { root, action, pickups, sessions } = page(SPAN);
		assert.deepEqual(action, ["review", "Review"]);
		assert.equal(root.querySelector('[data-slot="unit-standing"]')!.textContent, "On your own. Review overdue by a weekStudied 3 weeks ago");
		assert.deepEqual([pickups, sessions], [[], []]);
		assert.equal(root.querySelector('[data-slot="topic-sessions"]'), null);
	});

	it("puts a waiting problem and the open task under the head, and the past lessons below them, in reading order", () => {
		const practice = chat({ id: "chat_practice", title: "Rank practice", kind: "practice", pendingProblem: true, topics: ["rank"], updatedAt: "2026-11-08T07:54:30.000Z" });
		const second = chat({ title: "Rank, second pass", topics: ["rank"], updatedAt: "2026-11-03T14:32:01.000Z" });
		const first = chat({ title: "Rank and the column space", topics: ["rank"], updatedAt: "2026-10-30T16:45:01.000Z" });
		const { root, action, pickups, sessions } = page(RANK, [practice, second, first]);
		assert.deepEqual(action, ["resume", "Resume"]);
		assert.deepEqual(pickups, ["Rank practiceTodayProblem waitingYour turn", "Problem sheet 4Part (c)"]);
		assert.deepEqual(sessions, ["Rank, second pass5d ago", "Rank and the column space9d ago"]);
		const order = [...root.querySelectorAll('[data-testid="topic-action"], [data-slot="topic-pickup"], [data-testid="unit-page-session"]')].map(
			(el) => el.getAttribute("data-testid") ?? el.getAttribute("data-slot"),
		);
		assert.deepEqual(order, ["topic-action", "topic-pickup", "topic-pickup", "unit-page-session", "unit-page-session"]);
	});

	it("names the step a waiting lesson is on, with no head line on a topic not started", () => {
		const lesson = chat({ id: "chat_eigen", title: "Eigenvalues and eigenvectors", pendingQuestion: true, topics: ["eigen"], updatedAt: "2026-11-08T08:19:40.000Z" });
		const plan: SessionPlan = { id: "chat_eigen", tree: { nodes: [{ id: "compute", title: "Computing a 2×2 spectrum" }], edges: [] }, current: "compute", visited: [] };
		const { root, action, pickups, sessions } = page(EIGEN, [lesson], { plans: [plan] });
		assert.deepEqual(action, ["resume", "Resume"]);
		assert.equal(root.querySelector('[data-slot="unit-standing"]'), null);
		assert.deepEqual(pickups, ["Eigenvalues and eigenvectorsTodayComputing a 2×2 spectrumYour turn"]);
		assert.deepEqual(sessions, []);
	});

	it("opens the session the tutor is writing in, saying so once, with the spinner on its row", () => {
		const writing = chat({ title: "Determinants", topics: ["determinant"], busy: true, updatedAt: "2026-11-07T16:45:00.000Z" });
		const { root, action, pickups } = page(DETERMINANT, [writing]);
		assert.deepEqual(action, ["open", "Open"]);
		assert.deepEqual(pickups, ["DeterminantsYesterdayThe tutor is writing"]);
		assert.equal(root.querySelector('[data-slot="topic-pickup"] [data-slot="topic-why"]')!.getAttribute("data-kind"), "writing");
	});

	it("resumes the newest of two waiting sessions and lists the other with Your turn", () => {
		const newest = chat({ title: "Rank practice", kind: "practice", pendingProblem: true, topics: ["rank"], updatedAt: "2026-11-08T07:54:30.000Z" });
		const older = chat({ title: "Rank, second pass", pendingQuestion: true, topics: ["rank"], updatedAt: "2026-11-03T14:32:01.000Z" });
		const { pickups, sessions } = page(RANK, [newest, older]);
		assert.equal(pickups[0], "Rank practiceTodayProblem waitingYour turn");
		assert.deepEqual(sessions, ["Rank, second passYour turn"]);
	});

	it("shows five sessions and folds the rest under Earlier sessions, with no count", () => {
		const twelve = Array.from({ length: 12 }, (_, i) => chat({ title: `Span, lesson ${12 - i}`, topics: ["span"], updatedAt: new Date(Date.UTC(2026, 10, 7) - i * 3 * 86400000).toISOString() }));
		const { root, sessions } = page(SPAN, twelve);
		assert.deepEqual(sessions.slice(0, 2), ["Span, lesson 12Yesterday", "Span, lesson 114d ago"]);
		assert.equal(sessions.length, 5);
		assert.equal(root.querySelector('[data-slot="topic-earlier"]')!.textContent, "Earlier sessions");
		assert.doesNotMatch(root.textContent!, /\b12\b|\b7 more\b/);
	});

	it("draws Study in outline when nothing needs him, and no filled button anywhere", () => {
		const { root, action } = page(VECTORS);
		assert.deepEqual(action, ["study", "Study"]);
		assert.equal(root.querySelectorAll('[data-variant="default"]').length, 0);
		assert.match(root.querySelector('[data-slot="unit-standing"]')!.textContent!, /^On your own\. Next review Fri 13 Nov/);
	});

	it("never has more than one filled button, whatever the state", () => {
		const practice = chat({ kind: "practice", pendingProblem: true, topics: ["rank"] });
		for (const [t, sessions] of [
			[RANK, [practice]],
			[SPAN, []],
			[EIGEN, []],
			[DETERMINANT, []],
		] as const) {
			assert.ok(page(t, [...sessions]).root.querySelectorAll('[data-variant="default"]').length <= 1, t.handle);
		}
	});

	it("holds the action and every pick-up row while a start is in flight", () => {
		const practice = chat({ id: "chat_practice", kind: "practice", pendingProblem: true, topics: ["rank"], updatedAt: "2026-11-08T07:54:30.000Z" });
		const { root } = page(RANK, [practice], { busy: true });
		assert.equal(root.querySelector('[data-testid="topic-action"]')!.hasAttribute("disabled"), true);
		assert.equal(root.querySelector('[data-slot="topic-pickup"][data-kind="task"]')!.hasAttribute("disabled"), true);
		assert.equal(root.querySelector('[data-slot="topic-pickup"][data-kind="session"]')!.getAttribute("aria-disabled"), "true");
	});
});
