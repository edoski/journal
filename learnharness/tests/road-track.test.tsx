/**
 * Road in rows (course-page/candidates/roadrows/roadrows.md): the road's
 * track left to right, the arcs folded away a press on the track where they
 * would be, the exam at its place, and the open arc's topics under its stop.
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
import { FOLD_WORDS, RoadTrack } from "../components/course-page/candidates/roadrows/road-track.tsx";

const a = (handle: string) => handle as ArcHandle;
const section = (handle: string) => ({ arc: { handle: a(handle) }, topics: [] }) as unknown as CourseArcSection;
const road = ["a", "b", "c", "d", "e"].map(section);
const kinds = (items: TrackItem[]) => items.map((i) => (i.kind === "stop" ? i.section.arc.handle : i.kind === "fold" ? `fold:${i.side}` : "exam"));

describe("the road's track", () => {
	it("folds each run of arcs away into one press where it would be: earlier, between, later", () => {
		assert.deepEqual(kinds(trackItems(road, [road[1]!, road[3]!], undefined, true)), ["fold:earlier", "b", "fold:between", "d", "fold:later"]);
	});

	it("puts the exam at its place on the whole road, never folded away", () => {
		assert.deepEqual(kinds(trackItems(road, [road[0]!, road[1]!], a("d"), true)), ["a", "b", "fold:later", "exam", "fold:later"], "the exam stays between the arcs folded before and after it");
		assert.deepEqual(kinds(trackItems(road, road, a("d"), true)), ["a", "b", "c", "exam", "d", "e", "fold:near"]);
		assert.deepEqual(kinds(trackItems(road, road, null, false)), ["a", "b", "c", "d", "e", "exam"], "after every arc, and no fold back when nothing folds");
	});

	it("says Earlier, Later and Only what's near in plain words", () => {
		assert.deepEqual([FOLD_WORDS.earlier, FOLD_WORDS.later, FOLD_WORDS.near], ["Earlier", "Later", "Only what's near"]);
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

	it("opens the arc the map shows, its topics under its stop, and folds the others to their stop", () => {
		const open = [...document.querySelectorAll('[data-slot="road-stop"][data-open]')];
		assert.deepEqual(open.map((s) => s.getAttribute("data-arc")), ["maps"]);
		assert.deepEqual([...open[0]!.querySelectorAll('[data-slot="course-topic-row"]')].map((r) => r.getAttribute("data-topic")), ["rank", "kernel"]);
		assert.equal(document.querySelectorAll('[data-slot="course-topic-row"]').length, 2, "only the open arc's topics");
	});

	it("shows only the stretch near him, the arcs before it one Earlier press on the track", () => {
		assert.deepEqual([...document.querySelectorAll('[data-slot="road-stop"]')].map((s) => s.getAttribute("data-arc")), ["maps", "eigen"]);
		assert.equal(document.querySelector('[data-slot="road-fold"]')?.getAttribute("data-side"), "earlier");
	});

	it("ends each stop in its one fact: Check it on a ready arc, the day a new arc starts, and the exam a stop", () => {
		const atSpaces = courseRead({ status: "ready", courses: [{ ...course, map: { ...course.map, current: h("span") } }], failed: [], open: [], chats: [] }, course.map.workspace);
		const spacesView = (atSpaces as Extract<typeof atSpaces, { status: "ready" }>).view;
		const here = render(<RoadTrack {...columns} view={spacesView} shown={spacesView.arcs![0]!} onFollow={noop} />);
		assert.ok(here.querySelector('[data-arc="spaces"] [data-slot="road-stop-check"]'), "Check it");
		assert.equal(document.querySelector('[data-arc="eigen"] [data-slot="road-stop-state"]')?.textContent, "Starts 20 Nov");
		assert.ok(document.querySelector('[data-slot="road-exam"]'), "the exam's stop");
		assert.ok(document.querySelector('[data-slot="arc-pill"]') === null, "no pills");
	});

	it("keeps its height for the course's longest arc, so the map above never moves", () => {
		assert.match(document.querySelector('[data-slot="road-track"]')!.getAttribute("style") ?? "", /height:\s*208px/);
	});

	it("draws each topic as Home's Today row at its compact size: the pie beside where he stands, then the topic and its fact", () => {
		const row = document.querySelector('[data-slot="course-topic-row"][data-topic="rank"]')!;
		assert.match(row.className, /\bh-12\b/);
		assert.match(row.className, /grid-cols-\[1rem_minmax\(0,1fr\)_auto\]/);
		assert.equal(row.children.length, 4, "pie, where he stands, the topic, its fact");
	});

	it("is shadcn's carousel, its items centred, the track stopping short of every marker", () => {
		assert.ok(document.querySelector('[data-slot="carousel"] [data-slot="carousel-content"]'));
		const stop = document.querySelector('[data-slot="road-stop"]')!;
		assert.match(stop.className, /before:w-\[calc\(50%-6px\)\]/, "the stretch before stops 6px short of the marker");
		assert.match(stop.className, /after:left-\[calc\(50%\+22px\)\]/, "the stretch after starts 6px past it");
		assert.equal(document.querySelectorAll('[data-slot="road-stop"]').length, 2);
	});
});
