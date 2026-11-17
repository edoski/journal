/**
 * Road in rows (course-page/candidates/roadrows/roadrows.md): the road's
 * arcs as cards left to right with the exam at its place, and the selected
 * arc's topics in the panel under them.
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRef } from "react";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ArcHandle, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseRead, type CourseArcSection, type CourseView } from "../components/course-page/course-model.ts";
import type { CourseColumns } from "../components/course-page/split/split-course.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { trackItems, type TrackItem } from "../components/course-page/candidates/roadrows/track-model.ts";
import { RoadTrack } from "../components/course-page/candidates/roadrows/road-track.tsx";

const a = (handle: string) => handle as ArcHandle;
const section = (handle: string) => ({ arc: { handle: a(handle) }, topics: [] }) as unknown as CourseArcSection;
const road = ["a", "b", "c", "d", "e"].map(section);
const kinds = (items: TrackItem[]) => items.map((i) => (i.kind === "stop" ? i.section.arc.handle : "exam"));

describe("the road's track", () => {
	it("holds every arc in study order, the exam at its place", () => {
		assert.deepEqual(kinds(trackItems(road, a("d"))), ["a", "b", "c", "exam", "d", "e"]);
		assert.deepEqual(kinds(trackItems(road, null)), ["a", "b", "c", "d", "e", "exam"], "after every arc");
		assert.deepEqual(kinds(trackItems(road, undefined)), ["a", "b", "c", "d", "e"], "no exam ahead");
	});

});

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title: handle[0]!.toUpperCase() + handle.slice(1), level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });
const course: StudyCourse = {
	map: {
		workspace: "/study/linalg",
		title: "Linear Algebra",
		today: "2026-11-08",
		revision: 1,
		exam: { date: "2026-12-03", daysLeft: 25 },
		current: h("rank"),
		focus: null,
		tasks: [],
		topics: [topic("span", { level: "retained", arc: a("spaces") }), topic("rank", { arc: a("maps") }), topic("kernel", { level: "new", introduced: null, arc: a("maps") }), topic("eigen", { level: "new", introduced: null, arc: a("eigen"), starts: "2026-11-20" })],
		edges: [],
		arcs: [
			{ handle: a("spaces"), title: "Vector spaces", state: "ready", entry: [] },
			{ handle: a("maps"), title: "Linear maps", state: "learning", entry: [] },
			{ handle: a("eigen"), title: "Eigenvalues", state: "new", entry: [] },
		],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	newToday: [],
};
const read = courseRead({ status: "ready", courses: [course], failed: [], open: [], chats: [] }, course.map.workspace);
const view = (read as Extract<typeof read, { status: "ready" }>).view as CourseView;
const noop = () => {};
const columns: CourseColumns = {
	view,
	standing: null,
	busy: false,
	onContinue: noop,
	groups: view.groups,
	shown: view.arcs!.find((s) => s.current) ?? null,
	showArc: noop,
	open: {},
	onOpenChange: noop,
	onCheck: noop,
	checking: null,
	marked: null,
	onPoint: noop,
	listRef: createRef(),
	onEnterMap: noop,
	onExitTop: noop,
};
const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close: () => {} }) as never}>{node}</ServerEventsProvider>
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;

describe("the road under the map", () => {
	const document = render(<RoadTrack {...columns} onFollow={noop} />);

	it("selects the arc the map shows, its topics in the panel under the cards", () => {
		const open = [...document.querySelectorAll('[data-slot="road-stop"][data-open]')];
		assert.deepEqual(open.map((s) => s.getAttribute("data-arc")), ["maps"]);
		assert.deepEqual([...document.querySelectorAll('[data-slot="road-topics"] [data-slot="course-topic-row"]')].map((r) => r.getAttribute("data-topic")), ["rank", "kernel"]);
		assert.equal(document.querySelectorAll('[data-slot="course-topic-row"]').length, 2, "only the open arc's topics");
	});

	it("shows every arc as a card, with no fold presses", () => {
		assert.deepEqual([...document.querySelectorAll('[data-slot="road-stop"]')].map((s) => s.getAttribute("data-arc")), ["spaces", "maps", "eigen"]);
		assert.ok(document.querySelector('[data-slot="road-fold"]') === null);
	});

	it("heads each card with its one fact, puts Check it over a ready arc's topics, and makes the exam a card", () => {
		const atSpaces = courseRead({ status: "ready", courses: [{ ...course, map: { ...course.map, current: h("span") } }], failed: [], open: [], chats: [] }, course.map.workspace);
		const spacesView = (atSpaces as Extract<typeof atSpaces, { status: "ready" }>).view;
		const here = render(<RoadTrack {...columns} view={spacesView} shown={spacesView.arcs![0]!} onFollow={noop} />);
		assert.ok(here.querySelector('[data-slot="road-topics"] [data-slot="road-stop-check"]'), "Check it");
		assert.equal(document.querySelector('[data-arc="eigen"] [data-slot="road-stop-state"]')?.textContent, "Starts 20 Nov");
		assert.ok(document.querySelector('[data-slot="road-exam"]'), "the exam's stop");
		assert.ok(document.querySelector('[data-slot="arc-pill"]') === null, "no pills");
	});

	it("keeps its height for the course's longest arc, so the map above never moves", () => {
		assert.match(document.querySelector('[data-slot="road-track"]')!.getAttribute("style") ?? "", /height:\s*188px/);
	});

	it("draws each topic as Home's Today row at its compact size: the pie beside where he stands, then the topic and its fact", () => {
		const row = document.querySelector('[data-slot="course-topic-row"][data-topic="rank"]')!;
		assert.match(row.className, /\bh-12\b/);
		assert.match(row.className, /grid-cols-\[1rem_minmax\(0,1fr\)_auto\]/);
		assert.equal(row.children.length, 4, "pie, where he stands, the topic, its fact");
	});

	it("draws every arc as a card, as the map draws its cards, all in one row that scrolls only natively", () => {
		const stop = document.querySelector('[data-slot="road-stop"]')!;
		assert.match(stop.className, /\brounded-lg\b/);
		assert.match(stop.className, /\bborder\b/);
		assert.match(stop.className, /\bbg-card\b/);
		assert.match(document.querySelector('[data-slot="road-window"]')!.className, /\bsnap-x\b/, "a row too long to fit snaps to a card's edge");
		assert.equal(document.querySelectorAll('[data-slot="road-stop"]').length, 3);
	});

});
