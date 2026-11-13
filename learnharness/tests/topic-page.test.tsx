/**
 * The topic page's head: the course line that opens the course's page,
 * where he stands and what went wrong. Same tsx classic-JSX shim as the
 * other render tests.
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
import { topicFacts, type TopicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { TopicHead } from "../components/unit-inbox/topic-page/topic-head.tsx";
import { courseHref } from "../components/unit-inbox/unit-href.ts";

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
	const head = (facts: TopicFacts) => render(<TopicHead facts={facts} />);

	it("opens the course's page from the course line, and has no button: the history's Now holds the action", () => {
		const document = head(factsOf(RANK));
		const course = document.querySelector('[data-slot="topic-course-link"]')!;
		assert.equal(course.getAttribute("href"), courseHref(WORKSPACE));
		assert.equal(course.textContent, "Linear Algebra");
		assert.equal(document.querySelector("button"), null);
	});

	it("says where he stands, when he last studied it and what went wrong", () => {
		const document = head(factsOf(RANK));
		assert.equal(document.querySelector("h1")!.textContent, "Rank and the column space");
		assert.equal(document.querySelector('[data-slot="unit-standing"]')!.textContent, "Right with help. Mistake to fix. 3d overdueStudied 9 days ago");
		const marks = Array.from(document.querySelectorAll('[data-slot="topic-mark"]'));
		assert.deepEqual(marks.map((mark) => [mark.getAttribute("data-kind"), mark.textContent, mark.querySelectorAll("svg").length]), [["slip", ". Mistake to fix", 1], ["review", ". 3d overdue", 1]]);
		assert.equal(document.querySelector('[data-slot="topic-studied"]')!.textContent, "Studied 9 days ago");
		assert.equal(document.querySelector('[data-slot="unit-gap"]')!.textContent, "Counts nonzero entries instead of pivots");
	});

	it("puts every line on one left edge, the shared pie leading where he stands, the words following the pie", () => {
		const document = head(factsOf(RANK));
		const header = document.querySelector('[data-slot="topic-head"]')!;
		for (const line of header.children) assert.doesNotMatch(line.getAttribute("class") ?? "", /\b(pl|ml|ps|ms)-/, "no line indented");
		const words = document.querySelector('[data-slot="topic-standing-words"]')!;
		const pie = words.firstElementChild!;
		assert.equal(pie.getAttribute("data-slot"), "topic-glyph", "the pie leads the standing");
		assert.equal(pie.getAttribute("data-fill"), "0.75");
		assert.equal(words.textContent, "Right with help", "a three-quarter pie says Right with help");
	});

	it("draws no head line for a topic not started whose lesson waits on him", () => {
		const document = head(factsOf(EIGEN, [chat({ pendingQuestion: true, topics: ["eigen"] })]));
		assert.equal(document.querySelector('[data-slot="unit-standing"]'), null);
		assert.equal(document.querySelector('[data-slot="topic-glyph"]'), null);
	});
});
