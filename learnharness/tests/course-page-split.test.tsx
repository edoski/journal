/**
 * The course page's split candidate: the list and the map side by side,
 * tied together. What a row lights on the map, which row a node marks,
 * which groups the list shows, where the map pane scrolls, the keyboard
 * walk over the rows, and the two panes as they draw. Same tsx classic-JSX shim as the other render
 * tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseGroups } from "../components/course-page/course-model.ts";
import { layoutTopicMap, NODE_WIDTH } from "../components/course-map/topic-map/topic-map-layout.ts";
import { aimOf, boxesOf, fadeAcross, litOf, markedOf, revealOf, scrollOn, scrollToShow, shownGroups, slackOf, surfaceOf, topicAt, walkTo, type Box } from "../components/course-page/split/split-tie.ts";
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
		topic("independence", { title: "Linear independence", level: "assisted", introduced: "2026-09-10", weak: true, review: { kind: "due", date: "2026-11-01", overdue: 7 }, signals: { ...QUIET, confidentErrors: 1 } }),
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
const LAYOUT = layoutTopicMap(MAP.topics, MAP.edges);
const drawMap = (lit: ReadonlySet<TopicHandle> | null = null) => render(<SplitMap map={MAP} layout={LAYOUT} lit={lit} aim={null} reveal={null} onPoint={noop} onLeave={noop} />);

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

describe("the list's groups and rows", () => {
	const groups = courseGroups(COURSE);

	it("shows the four groups in their order, leaving an empty one out", () => {
		assert.deepEqual(
			shownGroups(groups).map((g) => g.title),
			["Needs you", "Learning", "Not started", "On your own"],
		);
		assert.deepEqual(shownGroups(courseGroups({ ...COURSE, map: { ...MAP, topics: [MAP.topics[4]!], edges: [] } })).map((g) => g.title), ["Not started"]);
		assert.deepEqual(shownGroups(courseGroups({ ...COURSE, map: { ...MAP, topics: [], edges: [] } })), []);
	});

	it("puts every topic a session waits on him for at the top of Needs you, out of Learning", () => {
		const waiting = (group: (typeof groups)[number], index: number) => ({ ...group.topics[index]!, fact: { kind: "your-turn" as const, words: "Your turn" } });
		const [needs, learning, notStarted, own] = groups;
		const marked = [
			needs!,
			{ ...learning!, topics: [waiting(learning!, 0)] },
			{ ...notStarted!, topics: [waiting(notStarted!, 0), ...notStarted!.topics.slice(1)] },
			own!,
		];
		const shown = shownGroups(marked);
		assert.deepEqual(
			shown.map((g) => [g.title, g.topics.map((t) => t.topic.handle)]),
			[
				["Needs you", ["span", "basis", "independence"]],
				["Not started", ["eigen"]],
				["On your own", ["vectors"]],
			],
			"Learning, left empty, is left out",
		);
	});

	it("draws every topic as a 32px row linking to its page, none folded away, its reason's icon and words showing", () => {
		const document = render(<SplitList groups={shownGroups(groups)} marked={null} onPoint={noop} onEnterMap={noop} />);
		const rows = [...document.querySelectorAll('[data-slot="course-topic-row"]')];
		assert.equal(rows.length, MAP.topics.length);
		assert.ok(rows.every((r) => r.className.includes("h-8") && !r.className.includes("h-9")), "every row is 32px");
		const fact = document.querySelector(`[href="${unitHref(WS, "independence")}"] [data-slot="course-topic-fact"]`)!;
		assert.equal(fact.textContent, "Sure, but wrong");
		assert.equal(fact.querySelectorAll(".sr-only").length, 0, "the words show, not only for a screen reader");
		assert.equal(document.querySelectorAll('[data-slot="course-group-more"]').length, 0);
		assert.equal(document.querySelectorAll('[data-slot="course-group-header"][aria-expanded="false"]').length, 0);
	});

	it("marks the row of the topic he points at on the map, and only that row", () => {
		const document = render(<SplitList groups={shownGroups(groups)} marked={h("span")} onPoint={noop} onEnterMap={noop} />);
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
		assert.match(pane.getAttribute("style") ?? "", /mask-image/);
		assert.ok(document.querySelector('[data-slot="course-split-map-scroller"]')!.className.includes("overflow-auto"), "the pane scrolls the map");
		assert.ok(!pane.className.includes("border"));
		assert.equal(document.querySelectorAll('[data-slot="course-map-node"]').length, MAP.topics.length);
	});

	it("dims every topic but the ones a row lights", () => {
		const document = drawMap(litOf({ handle: h("span"), from: "list" }, MAP.edges));
		const dimmed = [...document.querySelectorAll('[data-slot="course-map-node"]')].filter((n) => n.parentElement!.className.includes("opacity-35")).map((n) => n.getAttribute("data-testid"));
		assert.deepEqual(dimmed.sort(), ["map-node-basis", "map-node-eigen", "map-node-independence"]);
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

describe("bringing a marked row into view", () => {
	const view = { scrollTop: 100, height: 300 };

	it("leaves a row already in view where it is", () => {
		assert.equal(scrollToShow({ top: 150, height: 32 }, view, 4), null);
	});

	it("moves the pane as little as it can, keeping room for the focus ring", () => {
		assert.equal(scrollToShow({ top: 60, height: 32 }, view, 4), 56, "above: its top just in");
		assert.equal(scrollToShow({ top: 420, height: 32 }, view, 4), 156, "below: its bottom just in");
		assert.equal(scrollToShow({ top: 2, height: 32 }, view, 4), 0, "never past the top");
	});
});

describe("the map pane's surface and where it scrolls", () => {
	const room = { x: 48, y: 32 };

	it("draws a course too big for the pane at 100%, with a topic's worth of empty room past it on the axis it overflows", () => {
		const layout = { ...LAYOUT, width: 1000, height: 400 };
		const surface = surfaceOf(layout, { width: 600, height: 700 }, room, 20);
		assert.deepEqual(surface, { width: 1000 + 96 + slackOf(LAYOUT.node).x * 2, height: 400 + 104, zoom: 1 }, "as tall as the course, from the pane's top");
		assert.equal(surfaceOf({ ...layout, width: 224, height: 2000 }, { width: 600, height: 700 }, room, 20).width, 600, "a narrow course in the pane's middle");
	});

	it("draws a course that fits at 75% or more whole, from the pane's top, with nothing to scroll", () => {
		const layout = { ...LAYOUT, width: 744, height: 304 };
		const surface = surfaceOf(layout, { width: 696, height: 692 }, room, 20);
		assert.equal(surface.width, 696);
		assert.ok(surface.zoom > 0.8 && surface.zoom < 0.84, String(surface.zoom));
		assert.equal(surface.height, Math.floor((304 + 104) * surface.zoom));
		assert.equal(surfaceOf({ ...layout, width: 2000 }, { width: 696, height: 692 }, room, 20).zoom, 1, "below 75% it stays at 100% and scrolls");
	});

	it("places each topic where the map draws it: the course in the surface's middle", () => {
		const surface = { width: 1000, height: 600, zoom: 1 };
		const boxes = boxesOf(LAYOUT, surface);
		const at = LAYOUT.topics.get(h("vectors"))!;
		assert.deepEqual(boxes.get(h("vectors")), { x: (1000 - LAYOUT.width) / 2 + at.x, y: (600 - LAYOUT.height) / 2 + at.y, width: NODE_WIDTH, height: 64 });
	});

	// Three topics side by side, 224 wide, 24 apart, on a surface with room to scroll past them.
	const row = (xs: number[], y = 100): Map<TopicHandle, Box> => new Map(xs.map((x, i) => [h(`t${i}`), { x, y, width: 224, height: 64 }]));
	const surface = { width: 1400, height: 400 };
	const fade = { x: 48, y: 32 };

	it("leaves a topic already clear of the fade where it is", () => {
		assert.equal(scrollOn(row([300, 548, 796]), h("t1"), { left: 200, top: 0, width: 696, height: 400 }, surface, fade, "near"), null);
	});

	it("brings a topic into view cutting none at the pane's edges when it can, moving as little as it can", () => {
		const boxes = row([300, 548, 796]);
		const to = scrollOn(boxes, h("t2"), { left: 0, top: 0, width: 600, height: 400 }, surface, fade, "near")!;
		const view = { left: to.left, right: to.left + 600 };
		assert.ok(796 >= view.left + 48 && 1020 <= view.right - 48, "the target clear of the fade");
		for (const b of boxes.values()) {
			const showsPastFade = b.x + b.width > view.left + 48 && b.x < view.right - 48;
			const whole = b.x >= view.left && b.x + b.width <= view.right;
			assert.ok(!showsPastFade || whole, `topic at ${b.x} is not cut`);
		}
	});

	it("opens on the aim with as many whole topics in view as it can", () => {
		const boxes = row([100, 348, 596, 844]);
		const to = scrollOn(boxes, h("t1"), { left: 0, top: 0, width: 696, height: 400 }, surface, fade, "centre")!;
		const whole = [...boxes.values()].filter((b) => b.x >= to.left && b.x + b.width <= to.left + 696).length;
		assert.equal(whole, 2);
		assert.equal(scrollOn(boxes, h("nowhere"), { left: 0, top: 0, width: 696, height: 400 }, surface, fade, "centre"), null);
	});

	it("widens the fade across a pane too narrow for two topics, so the ones beside hide in it", () => {
		assert.equal(fadeAcross(696, 48), 48);
		assert.equal(fadeAcross(436, 48), 82);
		assert.equal(fadeAcross(0, 48), 48);
	});

	it("opens on what the header's button takes up when it is on the map, else the list's first row", () => {
		const shown = shownGroups(courseGroups(COURSE));
		assert.equal(aimOf([h("basis")], shown, LAYOUT), "basis");
		assert.equal(aimOf([h("elsewhere")], shown, LAYOUT), shown[0]!.topics[0]!.topic.handle);
		assert.equal(aimOf([], [], LAYOUT), null);
	});
});
