/**
 * The course page's split candidate: the list and the map side by side,
 * tied together. What a row lights on the map, which row a node marks,
 * which groups the list shows, where the map opens, the keyboard
 * walk over the rows, and the two panes as they draw. Same tsx classic-JSX shim as the other render
 * tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseGroups } from "../components/course-page/course-model.ts";
import { layoutTopicMap } from "../components/course-map/topic-map/topic-map-layout.ts";
import { OPEN_AT_FIRST, aimOf, walkStops, litOf, markedOf, revealOf, shownGroups, topicAt, walkTo } from "../components/course-page/split/split-tie.ts";
import { WholeCourseButton } from "../components/course-map/topic-map/whole-course-button.tsx";
import { SplitList } from "../components/course-page/split/split-list.tsx";
import { SplitMap } from "../components/course-page/split/split-map.tsx";
import { unitHref } from "../components/unit-inbox/unit-href.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const WS = "/study/linalg";
const MAP: StudyCourse["map"] = {
	workspace: WS,
	title: "Linear Algebra",
	today: "2026-11-08",
	revision: 1,
	exam: { date: "2026-11-29", daysLeft: 21 },
	current: h("independence"),
	focus: null,
	tasks: [],
	topics: [
		topic("vectors", { title: "Vectors", level: "transferred", introduced: "2026-09-01", review: { kind: "scheduled", date: "2026-11-13" } }),
		topic("span", { title: "Span", level: "assisted", introduced: "2026-09-05" }),
		topic("independence", { title: "Linear independence", level: "assisted", introduced: "2026-09-10", weak: true, review: { kind: "due", date: "2026-11-01", overdue: 7 }, signals: { ...QUIET, confidentErrors: 1, mistake: true } }),
		topic("basis", { title: "Basis and dimension" }),
		topic("eigen", { title: "Eigenvalues" }),
	],
	edges: [
		{ kind: "needs", prerequisite: h("vectors"), topic: h("span") },
		{ kind: "needs", prerequisite: h("span"), topic: h("independence") },
		{ kind: "needs", prerequisite: h("independence"), topic: h("basis") },
	],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: [], lastActiveDaysAgo: 2, newToday: [] };

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
const noop = () => {};
/** A course without arcs draws no arc line. */
const noArcLine = () => null;
const LAYOUT = layoutTopicMap(MAP.topics, MAP.edges);
const drawMap = (lit: ReadonlySet<TopicHandle> | null = null, reveal: TopicHandle | null = null) =>
	render(<SplitMap map={MAP} said={new Map()} lit={lit} aim={null} reveal={reveal} onPoint={noop} onLeave={noop} enlarged={false} onEnlarge={noop} />);

describe("what ties the two panes", () => {
	it("lights a pointed row's topic with its whole prerequisite chain, as a hover on the map does", () => {
		assert.deepEqual([...litOf({ handle: h("independence"), from: "list" }, MAP.edges)!].sort(), ["independence", "span", "vectors"]);
		assert.deepEqual([...litOf({ handle: h("vectors"), from: "list" }, MAP.edges)!], ["vectors"]);
	});

	it("brings a pointed row's topic into view on the map, and moves nothing for a node he points at there", () => {
		assert.equal(revealOf({ handle: h("span"), from: "list" }), "span");
		assert.equal(revealOf({ handle: h("span"), from: "map" }), null);
		assert.equal(revealOf(null), null);
	});

	it("leaves the map to light a node he points at on it, and marks that node's row instead", () => {
		assert.equal(litOf({ handle: h("span"), from: "map" }, MAP.edges), null);
		assert.equal(markedOf({ handle: h("span"), from: "map" }), "span");
		assert.equal(markedOf({ handle: h("span"), from: "list" }), null);
		assert.equal(litOf(null, MAP.edges), null);
		assert.equal(markedOf(null), null);
	});

	it("reads the topic a pointer or focus on the map is about from the node it sits in, and none between nodes", () => {
		const document = drawMap();
		const span = document.querySelector('[data-testid="map-node-span"]')!;
		assert.equal(topicAt(span), "span");
		assert.equal(topicAt(span.querySelector("span")), "span", "from inside the node too");
		assert.equal(topicAt(document.querySelector('[data-slot="course-split-map"]')), null);
		assert.equal(topicAt(null), null);
	});
});

/** A session on Span that waits on him, so Today takes Span up. */
const WAITING: ChatListItem = {
	id: "c1",
	title: "Span",
	kind: "teach",
	createdAt: "2026-11-08T08:00:00.000Z",
	updatedAt: "2026-11-08T08:30:00.000Z",
	messageCount: 4,
	phase: "teach",
	pendingQuestion: true,
	pendingProblem: false,
	busy: false,
	course: { workspace: WS, title: "Linear Algebra" },
	topics: [h("span")],
	ownTopics: [h("span")],
};

describe("the list's groups and rows", () => {
	const groups = courseGroups(COURSE, [WAITING]);

	it("shows the four groups in their order, leaving an empty one out", () => {
		assert.deepEqual(
			shownGroups(groups).map((g) => g.title),
			["Needs you", "Learning", "Not started", "On your own"],
		);
		assert.deepEqual(shownGroups(courseGroups({ ...COURSE, map: { ...MAP, topics: [MAP.topics[4]!], edges: [] } })).map((g) => g.title), ["Not started"]);
		assert.deepEqual(shownGroups(courseGroups({ ...COURSE, map: { ...MAP, topics: [], edges: [] } })), []);
	});

	it("draws each topic of an open group as a 32px row linking to its page, its reason's icon and words showing", () => {
		const shown = shownGroups(groups);
		const document = render(<SplitList groups={shown} open={OPEN_AT_FIRST} onOpenChange={noop} marked={null} onPoint={noop} onEnterMap={noop} arcLine={noArcLine} />);
		const rows = [...document.querySelectorAll('[data-slot="course-topic-row"]')];
		const openTopics = shown.filter((g) => OPEN_AT_FIRST[g.id]).flatMap((g) => g.topics);
		assert.equal(rows.length, openTopics.length);
		assert.ok(rows.every((r) => r.className.includes("h-8") && !r.className.includes("h-9")), "every row is 32px");
		const fact = document.querySelector(`[href="${unitHref(WS, "independence")}"] [data-slot="course-topic-fact"]`)!;
		assert.equal(fact.textContent, "Sure, but wrong");
		assert.equal(fact.querySelectorAll(".sr-only").length, 0, "the words show, not only for a screen reader");
		assert.equal(document.querySelectorAll('[data-slot="course-group-more"]').length, 0);
	});

	it("opens Needs you and Learning and folds Not started and On your own under headers he can open", () => {
		const document = render(<SplitList groups={shownGroups(groups)} open={OPEN_AT_FIRST} onOpenChange={noop} marked={null} onPoint={noop} onEnterMap={noop} arcLine={noArcLine} />);
		const headers = [...document.querySelectorAll('[data-slot="course-group-header"]')];
		assert.deepEqual(
			headers.map((h) => [h.textContent, h.tagName, h.getAttribute("aria-expanded")]),
			[
				["Needs you", "BUTTON", "true"],
				["Learning", "BUTTON", "true"],
				["Not started", "BUTTON", "false"],
				["On your own", "BUTTON", "false"],
			],
		);
		assert.ok(document.querySelector(`[href="${unitHref(WS, "vectors")}"]`) === null, "a folded group's rows are not drawn");
	});

	it("marks the row of the topic he points at on the map, and only that row", () => {
		const document = render(<SplitList groups={shownGroups(groups)} open={OPEN_AT_FIRST} onOpenChange={noop} marked={h("span")} onPoint={noop} onEnterMap={noop} arcLine={noArcLine} />);
		const marked = [...document.querySelectorAll('[data-slot="course-topic-row"][data-highlighted]')];
		assert.deepEqual(
			marked.map((r) => r.getAttribute("href")),
			[unitHref(WS, "span")],
		);
	});
});

describe("the map pane", () => {
	it("draws the course's map with no outline, faded at its edges, named for a screen reader", () => {
		const document = drawMap();
		const pane = document.querySelector('[data-slot="course-split-map"]')!;
		assert.equal(pane.getAttribute("aria-label"), "Linear Algebra map");
		const graph = document.querySelector('[data-slot="course-map-graph"]')!;
		assert.match(graph.parentElement!.getAttribute("style") ?? "", /mask-image/, "the map fades at its edges");
		assert.ok(document.querySelector('[data-slot="course-split-map-scroller"]') === null, "the map moves its own camera, as Home's does: no pane scrolls it");
		assert.ok(!pane.className.includes("border"));
		assert.equal(document.querySelectorAll('[data-slot="course-map-node"]').length, MAP.topics.length);
	});

	it("dims every topic but the ones a row lights, You are here and the topics it leads to", () => {
		const document = drawMap(litOf({ handle: h("span"), from: "list" }, MAP.edges));
		const dimmed = [...document.querySelectorAll('[data-slot="course-map-node"]')].filter((n) => /opacity:\s*0?\.\d/.test(n.parentElement!.parentElement!.getAttribute("style") ?? "")).map((n) => n.getAttribute("data-testid"));
		assert.deepEqual(dimmed.sort(), ["map-node-eigen"]);
	});

	it("rings the card of the row he points at with the glow, and no other", () => {
		const pointed = { handle: h("span"), from: "list" } as const;
		const document = drawMap(litOf(pointed, MAP.edges), revealOf(pointed));
		const glowing = [...document.querySelectorAll('.lh-card-mark > [data-slot="course-map-node"]')].map((n) => n.getAttribute("data-testid"));
		assert.deepEqual(glowing, ["map-node-span"]);
		assert.ok(drawMap().querySelector(".lh-card-mark") === null, "nothing glows at rest");
	});
});

describe("the keyboard walk over the rows", () => {
	it("steps into the list at the first row on Down or Home and at the last on Up or End", () => {
		assert.equal(walkTo("ArrowDown", null, 5), 0);
		assert.equal(walkTo("Home", null, 5), 0);
		assert.equal(walkTo("ArrowUp", null, 5), 4);
		assert.equal(walkTo("End", null, 5), 4);
		assert.equal(walkTo("ArrowDown", null, 0), null, "no rows, nowhere to go");
	});

	it("steps up and down, stops at the ends, jumps to them, and ignores other keys", () => {
		assert.equal(walkTo("ArrowDown", 1, 5), 2);
		assert.equal(walkTo("ArrowUp", 1, 5), 0);
		assert.equal(walkTo("ArrowDown", 4, 5), null);
		assert.equal(walkTo("ArrowUp", 0, 5), null);
		assert.equal(walkTo("End", 1, 5), 4);
		assert.equal(walkTo("Home", 3, 5), 0);
		assert.equal(walkTo("ArrowRight", 1, 5), null);
		assert.equal(walkTo("a", 1, 5), null);
	});
});

describe("what the arrows walk in the list", () => {
	const groups = shownGroups(courseGroups(COURSE, [WAITING]));
	it("walks each group's header and the rows of the open groups, skipping a folded group's rows", () => {
		const keys = (open: typeof OPEN_AT_FIRST) => walkStops(groups, open).map((s) => (s.kind === "row" ? s.handle : `[${s.id}]`));
		const atFirst = keys(OPEN_AT_FIRST);
		for (const g of groups) {
			assert.ok(atFirst.includes(`[${g.id}]`), `${g.title}'s header is a stop`);
			for (const t of g.topics) assert.equal(atFirst.includes(t.topic.handle), OPEN_AT_FIRST[g.id], `${t.topic.handle} walked only while ${g.title} is open`);
		}
		const opened = keys({ ...OPEN_AT_FIRST, "on-your-own": true });
		const own = groups.find((g) => g.id === "on-your-own")!;
		assert.deepEqual(opened.slice(opened.indexOf("[on-your-own]") + 1), own.topics.map((t) => t.topic.handle), "an opened group's rows follow its header");
	});
});

describe("where the map pane opens and its zoom out", () => {
	it("names the zoom out in words beside its icon, and the way back once pressed", () => {
		const shown = (whole: boolean) => render(<WholeCourseButton whole={whole} onToggle={noop} />).querySelector('[data-slot="course-map-whole"]')!;
		assert.equal(shown(false).textContent, "Whole course");
		assert.equal(shown(false).getAttribute("aria-pressed"), "false");
		assert.ok(shown(false).querySelector("svg"), "an icon beside the words");
		assert.equal(shown(true).textContent, "Back to where you are");
		assert.equal(shown(true).getAttribute("aria-pressed"), "true");
	});

	it("opens where he is, else on what the header's button takes up when it is on the map, else the list's first row", () => {
		const shown = shownGroups(courseGroups(COURSE, [WAITING]));
		assert.equal(aimOf(h("eigen"), [h("basis")], shown, LAYOUT), "eigen");
		assert.equal(aimOf(null, [h("basis")], shown, LAYOUT), "basis");
		assert.equal(aimOf(h("elsewhere"), [h("basis")], shown, LAYOUT), "basis");
		assert.equal(aimOf(null, [h("elsewhere")], shown, LAYOUT), shown[0]!.topics[0]!.topic.handle);
		assert.equal(aimOf(null, [], [], LAYOUT), null);
	});
});
