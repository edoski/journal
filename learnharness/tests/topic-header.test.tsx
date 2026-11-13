/**
 * The topic page's header as the topic map's node opens it: the standing
 * in the map's words, the diagnosed mistake, the open task, and Study.
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { TopicHeader, standingLine } from "../components/unit-inbox/topic-header.tsx";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const due = (overdue: number) => ({ kind: "due" as const, date: "2026-11-01", overdue });

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const TOPICS = [
	topic("vectors", { title: "Vectors", level: "transferred", review: { kind: "scheduled", date: "2026-11-13" } }),
	topic("independence", { title: "Linear independence", level: "assisted", weak: true, review: due(16), signals: { ...QUIET, gap: "Treats pairwise non-parallel vectors as independent" } }),
	topic("basis", { title: "Basis and dimension", level: "independent", review: due(0), tasks: ["sheet-4"] }),
	topic("matmul", { title: "Matrix multiplication", level: "independent", weak: true, review: due(2), signals: { ...QUIET, lapsed: true } }),
	topic("determinant", { title: "Determinants", level: "assisted", review: due(4) }),
	topic("eigen", { title: "Eigenvalues" }),
];
const MAP: CourseMap = {
	workspace: "/study/linalg",
	title: "Linear Algebra",
	today: "2026-11-08",
	revision: 13,
	exam: null,
	current: h("basis"),
	focus: "sheet-4",
	tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" }],
	topics: TOPICS,
	edges: [],
};
const byHandle = (handle: string) => TOPICS.find((t) => t.handle === handle)!;
const titleOf = (handle: TopicHandle) => byHandle(handle).title;

describe("topic page header", () => {
	const render = (node: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;

	it("says the standing in the map's words, then why the topic needs him or when its review comes back", () => {
		assert.equal(standingLine(byHandle("matmul"), titleOf), "On your own. Missed last time");
		assert.equal(standingLine(byHandle("vectors"), titleOf), "On your own. Back Fri 13 Nov");
		assert.equal(standingLine(byHandle("determinant"), titleOf), "Nearly on your own");
		assert.equal(standingLine(byHandle("eigen"), titleOf), "Not started");
	});

	it("shows the diagnosed mistake, the open task that holds the topic, and Study when no session waits", () => {
		const document = render(<TopicHeader map={MAP} topic={byHandle("independence")} onStudy={() => {}} busy={false} />);
		assert.equal(document.querySelector('[data-slot="unit-gap"]')!.textContent, "Treats pairwise non-parallel vectors as independent");
		assert.equal(document.querySelector('[data-testid="study-topic"]')!.textContent, "Study");
		assert.equal(document.querySelector('[data-slot="unit-task"]'), null);
		const held = render(<TopicHeader map={MAP} topic={byHandle("basis")} busy={false} />);
		assert.equal(held.querySelector('[data-slot="unit-task"]')!.textContent, "In Problem sheet 4, at part (c)");
		assert.equal(held.querySelector('[data-testid="study-topic"]'), null, "a session to resume holds the page's one button");
	});
});
