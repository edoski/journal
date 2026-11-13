/**
 * The topic page's shared parts behind the Topic switch: the head with the
 * page's one action, the pick-up rows, the session rows, and each
 * candidate drawing them. Same tsx classic-JSX shim as the other render
 * tests; the switch reads Current under test, so each candidate is
 * imported directly.
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
import { POLISH_GROUPS, useTopicVariant } from "../components/design-variant.ts";
import { topicFacts, type TopicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { TopicHead } from "../components/unit-inbox/topic-page/topic-head.tsx";
import { PickupRows } from "../components/unit-inbox/topic-page/pickup-rows.tsx";
import { SessionRows } from "../components/unit-inbox/topic-page/session-rows.tsx";
import { TOPIC_CANDIDATES } from "../components/unit-inbox/topic-page/topic-page.tsx";

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
const MAP: CourseMap = {
	workspace: WORKSPACE,
	title: "Linear Algebra",
	today: TODAY,
	revision: 13,
	exam: null,
	current: "rank" as TopicHandle,
	focus: "sheet-4",
	tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" }],
	topics: [RANK, SPAN, VECTORS, EIGEN],
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
		updatedAt: `2026-11-0${Math.max(1, 8 - ids)}T10:00:00.000Z`,
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

const factsOf = (t: CourseMapTopic, sessions: ChatListItem[] = []): TopicFacts => topicFacts({ course: COURSE, topic: t, chats: sessions.map((c) => ((c.topics ?? []).includes(t.handle) ? c : { ...c, topics: [...(c.topics ?? []), t.handle] })), read: null });
const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;

describe("the topic head", () => {
	const head = (facts: TopicFacts) => render(<TopicHead facts={facts} busy={false} onAct={() => {}} />);

	it("has one action, filled when something needs him and in outline when nothing does", () => {
		const cases: [TopicFacts, string, string, string][] = [
			[factsOf(RANK, [chat({ kind: "practice", pendingProblem: true, topics: ["rank"] })]), "resume", "Resume", "default"],
			[factsOf(SPAN), "review", "Review", "default"],
			[factsOf(VECTORS), "study", "Study", "outline"],
			[factsOf(EIGEN), "start", "Start", "default"],
		];
		for (const [facts, action, words, variant] of cases) {
			const buttons = head(facts).querySelectorAll('[data-testid="topic-action"]');
			assert.equal(buttons.length, 1);
			assert.deepEqual([buttons[0]!.getAttribute("data-action"), buttons[0]!.textContent, buttons[0]!.getAttribute("data-variant")], [action, words, variant]);
		}
	});

	it("says where he stands, when he last studied it and what went wrong", () => {
		const document = head(factsOf(RANK));
		assert.equal(document.querySelector("h1")!.textContent, "Rank and the column space");
		assert.equal(document.querySelector('[data-slot="unit-standing"]')!.textContent, "Nearly on your own. A mistake to fix. Review overdue by 3 daysStudied 9 days ago");
		const marks = Array.from(document.querySelectorAll('[data-slot="topic-mark"]'));
		assert.deepEqual(marks.map((mark) => [mark.getAttribute("data-kind"), mark.textContent, mark.querySelectorAll("svg").length]), [["slip", ". A mistake to fix", 1], ["review", ". Review overdue by 3 days", 1]]);
		assert.equal(document.querySelector('[data-slot="topic-studied"]')!.textContent, "Studied 9 days ago");
		assert.equal(document.querySelector('[data-slot="unit-gap"]')!.textContent, "Counts nonzero entries instead of pivots");
	});

	it("draws no head line for a topic not started whose lesson waits on him", () => {
		const document = head(factsOf(EIGEN, [chat({ pendingQuestion: true, topics: ["eigen"] })]));
		assert.equal(document.querySelector('[data-slot="unit-standing"]'), null);
		assert.equal(document.querySelector('[data-slot="topic-glyph"]'), null);
	});

	it("disables the action while a start is in flight", () => {
		const document = render(<TopicHead facts={factsOf(SPAN)} busy onAct={() => {}} />);
		assert.equal(document.querySelector('[data-testid="topic-action"]')!.hasAttribute("disabled"), true);
	});
});

describe("the pick-up rows", () => {
	it("draw nothing when there is no place to pick up", () => {
		assert.equal(renderToStaticMarkup(<PickupRows pickups={[]} busy={false} onTask={() => {}} />), "");
	});

	it("link a waiting session and offer the open task as a button", () => {
		const practice = chat({ id: "chat_practice", title: "Rank practice", kind: "practice", pendingProblem: true, topics: ["rank"] });
		const document = render(<PickupRows pickups={factsOf(RANK, [practice]).pickups} busy={false} onTask={() => {}} />);
		const rows = [...document.querySelectorAll('[data-slot="topic-pickups"] > li > *')];
		assert.deepEqual(
			rows.map((row) => [row.tagName, row.getAttribute("data-kind")]),
			[
				["A", "session"],
				["BUTTON", "task"],
			],
		);
		assert.equal(rows[0]!.getAttribute("href"), "/chat/chat_practice");
		assert.match(rows[0]!.textContent!, /Rank practice.*Problem waiting.*Your turn/);
		assert.match(rows[1]!.textContent!, /Problem sheet 4.*Part \(c\)/);
		assert.equal(document.querySelector('[data-slot="topic-why"]')!.getAttribute("data-kind"), "reply");
	});
});

describe("the session rows", () => {
	it("draw nothing for a topic with no other session", () => {
		assert.equal(renderToStaticMarkup(<SessionRows entries={[]} />), "");
	});

	it("show five sessions, newest first, and keep the rest behind Earlier sessions", () => {
		const sessions = Array.from({ length: 7 }, (_, i) => chat({ title: `Lesson ${i + 1}`, topics: ["span"], updatedAt: `2026-11-0${8 - i}T10:00:00.000Z` }));
		const document = render(<SessionRows entries={factsOf(SPAN, sessions).listed} />);
		assert.equal(document.querySelector("h2")!.textContent, "Sessions");
		const shown = [...document.querySelectorAll('[data-testid="unit-page-session"]')];
		assert.deepEqual(
			shown.map((row) => row.textContent),
			["Lesson 1Today", "Lesson 2Yesterday", "Lesson 32d ago", "Lesson 43d ago", "Lesson 54d ago"],
		);
		assert.equal(document.querySelector('[data-slot="topic-earlier"]')!.textContent, "Earlier sessions");
		assert.equal(document.querySelector('[data-slot="topic-earlier"]')!.getAttribute("aria-expanded"), "false");
	});

	it("say a session waits on him in place of when", () => {
		const document = render(<SessionRows entries={factsOf(SPAN, [chat({ title: "Waiting", topics: ["span"], pendingQuestion: true })]).sessions} />);
		assert.equal(document.querySelector('[data-testid="unit-page-session"]')!.textContent, "WaitingYour turn");
	});
});

describe("the Topic switch", () => {
	it("is Current outside development, and picking a candidate wears the Proposed design", () => {
		let read: string | null = null;
		function Probe() {
			read = useTopicVariant();
			return null;
		}
		renderToStaticMarkup(<Probe />);
		assert.equal(read, "current");
		assert.deepEqual(
			POLISH_GROUPS.find((group) => group.id === "topic"),
			{ id: "topic", label: "Topic", options: ["brief", "steps", "trail", "hybrid"], requires: { design: "proposed" } },
		);
		assert.equal(POLISH_GROUPS.find((group) => group.id === "resume"), undefined);
		assert.equal(POLISH_GROUPS.find((group) => group.id === "pickup"), undefined);
	});

	it("draws every candidate as a working page: the head, the open task to pick up (the hybrid's in its history's Next), and every session one press away", () => {
		const practice = chat({ kind: "practice", pendingProblem: true, topics: ["rank"] });
		const past = chat({ title: "Rank, second pass", topics: ["rank"] });
		for (const [option, Candidate] of Object.entries(TOPIC_CANDIDATES)) {
			const document = render(<Candidate facts={factsOf(RANK, [practice, past])} busy={false} onAct={() => {}} onTask={() => {}} />);
			const root = document.querySelector('[data-testid="unit-page"]')!;
			assert.equal(root.getAttribute("data-topic-candidate"), option);
			assert.equal(root.querySelectorAll('[data-testid="topic-action"]').length, option === "hybrid" ? 0 : 1, option);
			assert.equal(root.querySelectorAll('[data-slot="topic-pickup"][data-kind="task"]').length, option === "hybrid" ? 0 : 1, option);
			for (const session of [practice, past]) assert.ok(root.querySelector(`a[href="/chat/${session.id}"]`), `${option}: ${session.title}`);
		}
	});
});
