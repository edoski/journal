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
import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseGroups } from "../components/course-page/course-model.ts";
import { layoutTopicMap, NODE_WIDTH, slackOf } from "../components/course-map/topic-map/topic-map-layout.ts";
import { OPEN_AT_FIRST, aimOf, boxesOf, walkStops, fadeAcross, litOf, markedOf, revealOf, scrollOfCamera, scrollOn, shownGroups, surfaceOf, topicAt, walkTo, wholeSurfaceOf, type Box } from "../components/course-page/split/split-tie.ts";
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
const LAYOUT = layoutTopicMap(MAP.topics, MAP.edges);
const drawMap = (lit: ReadonlySet<TopicHandle> | null = null, reveal: TopicHandle | null = null) =>
	render(<SplitMap map={MAP} said={new Map()} layout={LAYOUT} lit={lit} aim={null} reveal={reveal} onPoint={noop} onLeave={noop} />);

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
		const document = render(<SplitList groups={shown} open={OPEN_AT_FIRST} onOpenChange={noop} marked={null} onPoint={noop} onEnterMap={noop} />);
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
		const document = render(<SplitList groups={shownGroups(groups)} open={OPEN_AT_FIRST} onOpenChange={noop} marked={null} onPoint={noop} onEnterMap={noop} />);
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
		assert.equal(document.querySelector(`[href="${unitHref(WS, "vectors")}"]`), null, "a folded group's rows are not drawn");
	});

	it("marks the row of the topic he points at on the map, and only that row", () => {
		const document = render(<SplitList groups={shownGroups(groups)} open={OPEN_AT_FIRST} onOpenChange={noop} marked={h("span")} onPoint={noop} onEnterMap={noop} />);
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
		const scroller = document.querySelector('[data-slot="course-split-map-scroller"]')!;
		assert.match(scroller.parentElement!.getAttribute("style") ?? "", /mask-image/, "the map fades at its edges");
		assert.ok(scroller.className.includes("overflow-auto"), "the pane scrolls the map");
		assert.ok(!pane.className.includes("border"));
		assert.equal(document.querySelectorAll('[data-slot="course-map-node"]').length, MAP.topics.length);
	});

	it("dims every topic but the ones a row lights, You are here and the topics it leads to", () => {
		const document = drawMap(litOf({ handle: h("span"), from: "list" }, MAP.edges));
		const dimmed = [...document.querySelectorAll('[data-slot="course-map-node"]')].filter((n) => /opacity:\s*0?\.\d/.test(n.parentElement!.getAttribute("style") ?? "")).map((n) => n.getAttribute("data-testid"));
		assert.deepEqual(dimmed.sort(), ["map-node-eigen"]);
	});

	it("rings the card of the row he points at with the glow, and no other", () => {
		const pointed = { handle: h("span"), from: "list" } as const;
		const document = drawMap(litOf(pointed, MAP.edges), revealOf(pointed));
		const glowing = [...document.querySelectorAll('[data-slot="course-map-node"].lh-card-mark')].map((n) => n.getAttribute("data-testid"));
		assert.deepEqual(glowing, ["map-node-span"]);
		assert.equal(drawMap().querySelector(".lh-card-mark"), null, "nothing glows at rest");
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

describe("the map pane's surface and where it scrolls", () => {
	const room = { x: 48, y: 32 };

	it("draws a course too big for the pane at 100%, with a topic's worth of empty room past it on the axis it overflows", () => {
		const layout = { ...LAYOUT, width: 1000, height: 400 };
		const surface = surfaceOf(layout, { width: 600, height: 700 }, room, 20);
		assert.deepEqual(surface, { width: 1000 + 96 + slackOf(LAYOUT.node).x * 2, height: 400 + 104, zoom: 1 }, "as tall as the course, from the pane's top");
		assert.equal(surfaceOf({ ...layout, width: 224, height: 2000 }, { width: 600, height: 700 }, room, 20).width, 600, "a narrow course in the pane's middle");
	});

	it("draws the course at the scale it opens at, its room in the pane's pixels: the pane's width and the course's height where it fits, with nothing to scroll", () => {
		const layout = { ...LAYOUT, width: 744, height: 304 };
		const surface = surfaceOf(layout, { width: 696, height: 692 }, room, 20, 0.8);
		assert.deepEqual(surface, { width: 696, height: Math.floor(304 * 0.8 + 104), zoom: 0.8 });
		const wide = surfaceOf({ ...layout, width: 2000 }, { width: 696, height: 692 }, room, 20, 0.8);
		assert.equal(wide.width, Math.ceil(2000 * 0.8 + 96 + slackOf(LAYOUT.node).x * 2 * 0.8), "too wide: the course and its slack at that scale, and its room, to scroll");
	});

	it("scrolls the pane to show the course as the camera frames it, inside the surface", () => {
		const layout = { ...LAYOUT, width: 1000, height: 400 };
		const pane = { width: 600, height: 700 };
		const surface = surfaceOf(layout, pane, room, 20);
		const camera = { x: -300, y: 52 };
		const to = scrollOfCamera(layout, surface, pane, camera);
		const boxes = boxesOf(layout, surface);
		const at = layout.topics.get(h("vectors"))!;
		assert.equal(boxes.get(h("vectors"))!.x - to.left, at.x + camera.x, "a topic sits where the camera puts it across");
		assert.deepEqual(scrollOfCamera(layout, surface, pane, { x: 5000, y: 0 }).left, 0, "never past the surface");
	});

	it("places each topic where the map draws it: the course in the surface's middle", () => {
		const surface = { width: 1000, height: 600, zoom: 1 };
		const boxes = boxesOf(LAYOUT, surface);
		const at = LAYOUT.topics.get(h("vectors"))!;
		assert.deepEqual(boxes.get(h("vectors")), { x: (1000 - LAYOUT.width) / 2 + at.x, y: (600 - LAYOUT.height) / 2 + at.y, width: NODE_WIDTH, height: 64 });
	});

	it("zooms out to the whole course in the pane, every topic clear of the fade, only when it opens on less", () => {
		const layout = { ...LAYOUT, width: 2000, height: 1200 };
		const pane = { width: 696, height: 757 };
		const fade = { x: 82, y: 32 };
		const opened = surfaceOf(layout, pane, room, 20, 0.8);
		const whole = wholeSurfaceOf(layout, pane, opened, fade, room, 20)!;
		assert.ok(whole.width <= pane.width && whole.height <= pane.height, "nothing to scroll");
		const drawn = { left: (whole.width - layout.width * whole.zoom) / 2, top: (whole.height - layout.height * whole.zoom) / 2 };
		assert.ok(drawn.left >= fade.x && drawn.left + layout.width * whole.zoom <= pane.width - fade.x + 0.5, "clear of the fade across");
		assert.ok(drawn.top >= fade.y + 20 - 0.5 && drawn.top + layout.height * whole.zoom <= pane.height - fade.y - 20 + 0.5, "clear of the fade and the tag's room down");
		const small = { ...LAYOUT, width: 400, height: 200 };
		assert.equal(wholeSurfaceOf(small, pane, surfaceOf(small, pane, room, 20), fade, room, 20), null, "a course that opens whole offers nothing more");
		assert.equal(wholeSurfaceOf({ ...LAYOUT, width: 400, height: 300 }, { width: 696, height: 900 }, surfaceOf({ ...LAYOUT, width: 400, height: 300 }, { width: 696, height: 900 }, room, 20), fade, room, 20), null);
	});

	it("names the zoom out in words beside its icon, and the way back once pressed", () => {
		const shown = (whole: boolean) => render(<WholeCourseButton whole={whole} onToggle={noop} />).querySelector('[data-slot="course-map-whole"]')!;
		assert.equal(shown(false).textContent, "Whole course");
		assert.equal(shown(false).getAttribute("aria-pressed"), "false");
		assert.ok(shown(false).querySelector("svg"), "an icon beside the words");
		assert.equal(shown(true).textContent, "Back to where you are");
		assert.equal(shown(true).getAttribute("aria-pressed"), "true");
	});

	// Three topics side by side, 224 wide, 24 apart, on a surface with room to scroll past them.
	const row = (xs: number[], y = 100): Map<TopicHandle, Box> => new Map(xs.map((x, i) => [h(`t${i}`), { x, y, width: 224, height: 64 }]));
	const surface = { width: 1400, height: 400 };
	const fade = { x: 48, y: 32 };

	it("leaves a topic already clear of the fade where it is", () => {
		assert.equal(scrollOn(row([300, 548, 796]), h("t1"), { left: 200, top: 0, width: 696, height: 400 }, surface, fade), null);
	});

	it("brings a topic into view cutting none at the pane's edges when it can, moving as little as it can", () => {
		const boxes = row([300, 548, 796]);
		const to = scrollOn(boxes, h("t2"), { left: 0, top: 0, width: 600, height: 400 }, surface, fade)!;
		const view = { left: to.left, right: to.left + 600 };
		assert.ok(796 >= view.left + 48 && 1020 <= view.right - 48, "the target clear of the fade");
		for (const b of boxes.values()) {
			const showsPastFade = b.x + b.width > view.left + 48 && b.x < view.right - 48;
			const whole = b.x >= view.left && b.x + b.width <= view.right;
			assert.ok(!showsPastFade || whole, `topic at ${b.x} is not cut`);
		}
	});

	it("widens the fade across a pane too narrow for two topics, so the ones beside hide in it", () => {
		assert.equal(fadeAcross(696, 48), 48);
		assert.equal(fadeAcross(436, 48), 82);
		assert.equal(fadeAcross(0, 48), 48);
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
