import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { CourseMapGraph } from "../components/course-map/course-map-graph.tsx";
import { CourseMapList } from "../components/course-map/course-map-list.tsx";
import { layoutCourseMap } from "../components/course-map/course-map-layout.ts";
import { mapBody } from "../components/course-map/course-map-view.tsx";
import { reviewText, signalLines, topicCaption } from "../components/course-map/topic-words.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 };

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const MAP: CourseMap = {
	workspace: "/study/linalg",
	title: "Linear Algebra",
	today: "2026-11-08",
	revision: 13,
	exam: { date: "2026-11-29", daysLeft: 21 },
	current: h("rank"),
	focus: "sheet-4",
	tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" }],
	topics: [
		topic("vectors", { title: "Vectors", level: "transferred", review: { kind: "scheduled", date: "2026-11-23" } }),
		topic("elimination", { title: "Gaussian elimination", level: "assisted", review: { kind: "due", date: "2026-11-06", overdue: 2 }, weak: true }),
		topic("rank", { title: "Rank", level: "assisted", review: { kind: "due", date: "2026-11-05", overdue: 3 }, weak: true, tasks: ["sheet-4"] }),
		topic("cramer", { title: "Cramer's rule" }),
	],
	edges: [
		{ kind: "needs", prerequisite: h("vectors"), topic: h("elimination") },
		{ kind: "needs", prerequisite: h("elimination"), topic: h("rank") },
		{ kind: "needs", prerequisite: h("vectors"), topic: h("cramer") },
		{ kind: "contrasts", pair: [h("elimination"), h("cramer")] },
	],
};
const LAYOUT = layoutCourseMap(MAP.topics, MAP.edges);

function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

describe("course map words", () => {
	it("names the engine's level first, then due and weak, and 'not started' for a new topic", () => {
		assert.equal(topicCaption(MAP.topics[2]!), "assisted · due · weak");
		assert.equal(topicCaption(MAP.topics[0]!), "transferred");
		assert.equal(topicCaption(MAP.topics[3]!), "not started");
	});

	it("says the review in words from the engine's dates", () => {
		assert.equal(reviewText({ kind: "scheduled", date: "2026-11-13" }), "Next review Fri 13 Nov");
		assert.equal(reviewText({ kind: "due", date: "2026-11-08", overdue: 0 }), "Review due today");
		assert.equal(reviewText({ kind: "due", date: "2026-11-05", overdue: 3 }), "Review due since Thu 5 Nov (3 days)");
		assert.equal(reviewText(null), null);
	});

	it("gives one line per weak signal, naming a wrongly chosen method by its title", () => {
		const weak = topic("elimination", {
			signals: { gap: "Swaps rows wrongly", lapsed: true, stale: true, choiceErrors: { cramer: 2 }, confidentErrors: 1 },
		});
		assert.deepEqual(signalLines(weak, (handle) => (handle === "cramer" ? "Cramer's rule" : handle)), [
			"Swaps rows wrongly",
			"Slipped after an earlier solid answer",
			"The diagnosis may be out of date",
			"Chose Cramer's rule instead (2 times)",
			"One confident wrong answer",
		]);
	});
});

describe("course map page states", () => {
	const ready = { status: "ready" as const, courses: [{ workspace: "/study/linalg", title: "Linear Algebra", due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null }], roots: [] };
	it("shows one state at a time from the listing and the map fetch", () => {
		assert.equal(mapBody({ status: "loading" }, null, "").kind, "loading");
		assert.deepEqual(mapBody({ status: "unavailable", reason: "no python" }, null, ""), { kind: "unavailable", reason: "no python" });
		assert.equal(mapBody({ ...ready, courses: [] }, null, "").kind, "no-courses");
		assert.equal(mapBody(ready, { status: "loading", workspace: "/study/linalg" }, "/study/linalg").kind, "loading");
		assert.equal(mapBody(ready, { status: "ready", workspace: "/study/other", map: MAP }, "/study/linalg").kind, "loading", "a stale course's map is not shown");
		assert.deepEqual(mapBody(ready, { status: "failed", workspace: "/study/linalg", error: "io" }, "/study/linalg"), { kind: "failed", error: "io" });
		assert.equal(mapBody(ready, { status: "ready", workspace: "/study/linalg", map: { ...MAP, topics: [], edges: [] } }, "/study/linalg").kind, "empty");
		assert.equal(mapBody(ready, { status: "ready", workspace: "/study/linalg", map: MAP }, "/study/linalg").kind, "map");
	});
});

describe("course map drawing", () => {
	const document = documentFor(<CourseMapGraph map={MAP} layout={LAYOUT} jumpRequest={0} onStudy={() => {}} busy={false} />);
	const nodes = [...document.querySelectorAll('[data-slot="course-map-node"]')];

	it("draws every topic as a node naming its title and states, the current one tagged", () => {
		assert.deepEqual(
			nodes.map((n) => n.getAttribute("aria-label")),
			[
				"Vectors, transferred",
				"Gaussian elimination, assisted · due · weak",
				"Rank, you are here, assisted · due · weak, in an open task",
				"Cramer's rule, not started",
			],
		);
		assert.equal(document.querySelector('[data-slot="course-map-current-tag"]')!.textContent, "You are here");
		assert.equal(document.querySelectorAll("[data-current]").length, 1);
		assert.match(document.querySelector("figcaption")!.textContent!, /4 topics.*You are at Rank\./);
	});

	it("is one tab stop, the current topic, and draws needs but no contrasts at rest", () => {
		assert.deepEqual(
			nodes.filter((n) => n.getAttribute("tabindex") === "0").map((n) => n.getAttribute("data-testid")),
			["map-node-rank"],
		);
		assert.equal(document.querySelectorAll('[data-slot="course-map-graph"] > svg > path').length, 3);
		assert.equal(document.querySelectorAll('[data-slot="course-map-contrast"]').length, 0);
	});
});

describe("course map list", () => {
	it("lists the same layers as steps, each row with its states and prerequisites", () => {
		const document = documentFor(<CourseMapList map={MAP} layout={LAYOUT} onStudy={() => {}} busy={false} />);
		const steps = [...document.querySelectorAll("section")].map((section) => ({
			step: section.querySelector("h2")!.textContent,
			rows: [...section.querySelectorAll('[data-slot="course-map-row"]')].map((r) => r.textContent),
		}));
		assert.deepEqual(steps, [
			{ step: "Step 1", rows: ["Vectorstransferred"] },
			{ step: "Step 2", rows: ["Gaussian eliminationassisted · due · weakNeeds Vectors", "Cramer's rulenot startedNeeds Vectors"] },
			{ step: "Step 3", rows: ["RankYou are here · assisted · due · weakNeeds Gaussian elimination"] },
		]);
	});
});
