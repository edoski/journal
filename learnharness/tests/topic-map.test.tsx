/**
 * The topic map: what a node says from the engine's fields, the geometry
 * that keeps a need off the topics it passes, where the camera opens, how
 * the arrows walk it, and that a node is a link to its topic's page. Same
 * tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CourseMap, CourseMapEdge, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { TopicMap } from "../components/course-map/topic-map/topic-map.tsx";
import {
	LAYER_GAP,
	NODE_GAP,
	NODE_HEIGHT,
	NODE_WIDTH,
	READABLE_ZOOM,
	cardFit,
	chainOf,
	framedCamera,
	layoutTopicMap,
	neighbourOf,
	openingCamera,
	type Camera,
	type TopicMapLayout,
} from "../components/course-map/topic-map/topic-map-layout.ts";
import { standingOf, topicLabel } from "../components/course-map/topic-map/topic-standing.ts";
import { slipMark } from "../components/study-words.ts";
import { sidebarSays } from "../components/unit-inbox/sidebar-says.ts";
import { courseProgress } from "../components/study-home/agenda-rows/row-facts.ts";
import { unitHref } from "../components/unit-inbox/unit-href.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const due = (overdue: number) => ({ kind: "due" as const, date: "2026-11-01", overdue });

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

function edgesOf(needs: Record<string, string[]>): CourseMapEdge[] {
	return Object.entries(needs).flatMap(([t, prereqs]) => prereqs.map((p) => ({ kind: "needs" as const, prerequisite: h(p), topic: h(t) })));
}

/** Sixteen topics in seven layers, with needs that skip layers. */
const NEEDS: Record<string, string[]> = {
	vectors: [],
	span: ["vectors"],
	independence: ["span"],
	basis: ["independence"],
	matmul: ["vectors"],
	elimination: ["vectors"],
	rank: ["basis", "matmul", "elimination"],
	kernel: ["rank"],
	determinant: ["matmul"],
	cramer: ["determinant"],
	invertibility: ["rank", "determinant"],
	"change-basis": ["basis", "matmul"],
	eigen: ["determinant", "rank"],
	diagonalization: ["eigen", "basis", "change-basis"],
	"inner-product": ["vectors"],
	projection: ["inner-product", "basis"],
};
const STANDINGS: Record<string, Partial<CourseMapTopic>> = {
	vectors: { title: "Vectors", level: "transferred", review: { kind: "scheduled", date: "2026-11-13" } },
	span: { title: "Span", level: "retained", review: due(10) },
	independence: { title: "Linear independence", level: "assisted", weak: true, review: due(16), signals: { ...QUIET, gap: "Treats pairwise non-parallel vectors as independent", mistake: true, confidentErrors: 1 } },
	basis: { title: "Basis and dimension", level: "independent", review: due(0), tasks: ["sheet-4"] },
	matmul: { title: "Matrix multiplication", level: "independent", weak: true, review: due(2), signals: { ...QUIET, lapsed: true, mistake: true } },
	elimination: { title: "Gaussian elimination", level: "assisted", weak: true, signals: { ...QUIET, choiceErrors: { cramer: 1 }, mistake: true } },
	rank: { title: "Rank", level: "assisted", right: "helped", weak: true, review: due(3), signals: { ...QUIET, stale: true } },
	kernel: { title: "Kernel", level: "attempted", weak: true, signals: { ...QUIET, confidentErrors: 2, mistake: true } },
	determinant: { title: "Determinants", level: "assisted", right: "helped", review: due(4) },
	cramer: { title: "Cramer's rule", level: "introduced", review: due(2) },
};
const TOPICS = Object.keys(NEEDS).map((handle) => topic(handle, STANDINGS[handle]));
const MAP: CourseMap = {
	workspace: "/study/linalg",
	title: "Linear Algebra",
	today: "2026-11-08",
	revision: 13,
	exam: null,
	current: h("rank"),
	focus: "sheet-4",
	tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)", updated: null }],
	topics: TOPICS,
	edges: [...edgesOf(NEEDS), { kind: "contrasts", pair: [h("cramer"), h("elimination")] }],
};
const byHandle = (handle: string) => TOPICS.find((t) => t.handle === handle)!;

/** The muted line's contrast on its card, the whole card drawn at `opacity` over the page (the app's dark tokens). */
function contrastAt(opacity: number): number {
	const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
	const token = (name: string) => /#([0-9a-f]{6})/i.exec(new RegExp(`--${name}:\\s*([^;]+);`).exec(css)![1]!)![1]!;
	const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
	const over = (fg: number[], bg: number[]) => fg.map((c, i) => c * opacity + bg[i]! * (1 - opacity));
	const luminance = (c: number[]) => {
		const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
	};
	const page = rgb(token("background"));
	const [text, card] = [luminance(over(rgb(token("muted-foreground")), page)), luminance(over(rgb(token("card")), page))];
	return (Math.max(text, card) + 0.05) / (Math.min(text, card) + 0.05);
}
const titleOf = (handle: TopicHandle) => byHandle(handle).title;

describe("where he stands on a topic", () => {
	it("fills the pie a quarter per step towards doing it on his own, empty before he starts", () => {
		assert.deepEqual(
			(["new", "introduced", "attempted", "assisted", "independent", "retained", "transferred"] as const).map((level) => standingOf(topic("t", { level })).fill),
			[0, 0.25, 0.5, 0.75, 1, 1, 1],
		);
	});

	it("draws a full pie for exactly the topics the course's progress pie counts", () => {
		const full = TOPICS.filter((t) => standingOf(t).fill === 1).length;
		assert.equal(full, courseProgress({ map: MAP, unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 })!.solid);
		assert.equal(full, 3);
	});

	it("takes a quarter off a topic he could do on his own that the engine now calls weak, says what the pie shows, and marks every weak topic", () => {
		assert.deepEqual(standingOf(byHandle("matmul")), { fill: 0.75, slipping: true, words: "Slipping" }, "a 3/4 pie never says On your own");
		assert.deepEqual(standingOf(byHandle("rank")), { fill: 0.75, slipping: false, words: "Right with help" }, "still being learned: it never slips (round 11, 3 N1)");
		assert.equal(standingOf(byHandle("determinant")).slipping, false);
	});

	it("says it in the pie's words, Slipping on a topic he is losing, with no engine level names", () => {
		assert.deepEqual(
			["eigen", "cramer", "kernel", "determinant", "span", "matmul"].map((handle) => standingOf(byHandle(handle)).words),
			["Not started", "Taught, not tried", "Tried, not right yet", "Right with help", "On your own", "Slipping"],
		);
	});
});

describe("why a topic needs him", () => {
	const slip = (t: CourseMapTopic) => (t.weak ? slipMark(t.signals, titleOf).words : null);
	const words = (handle: string) => slip(byHandle(handle));

	it("gives a weak topic its first reason: a miss, a diagnosed mistake, a method chosen in its place, a sure wrong answer", () => {
		assert.equal(words("matmul"), "Not right last time");
		assert.equal(words("independence"), "Mistake to fix");
		assert.equal(words("elimination"), "Mixed up with Cramer's rule");
		assert.equal(words("kernel"), "Sure, but wrong");
		assert.equal(words("rank"), "Check on your own", "no wrong answer open");
	});

	it("says a mistake he has answered right since is fixed, to be checked again", () => {
		const fixed = (signals: { gap?: string; lapsed?: boolean }) => slip(topic("t", { level: "assisted", weak: true, signals: { ...QUIET, ...signals, repaired: true } }))!;
		assert.equal(fixed({ gap: "Writes det as ad + bc" }), "Check again another day");
		assert.equal(fixed({ lapsed: true }), "Check again another day");
	});

	it("says nothing for a topic still being learned, one resting until its review, or one not started", () => {
		assert.equal(words("determinant"), null, "being learned: nearly every one is due");
		assert.equal(words("vectors"), null);
		assert.equal(words("eigen"), null);
	});

	it("names a node for a screen reader: title, that he is there, the standing, the card's line", () => {
		assert.equal(topicLabel(byHandle("rank"), true, { kind: "your-turn", words: "Your turn" }), "Rank, You are here, Right with help, Your turn");
		assert.equal(topicLabel(byHandle("vectors"), false, null), "Vectors, On your own");
	});
});

function assertDrawable(layout: TopicMapLayout, edges: readonly CourseMapEdge[]) {
	for (const edge of edges) {
		if (edge.kind !== "needs") continue;
		const above = layout.topics.get(edge.prerequisite)!;
		const below = layout.topics.get(edge.topic)!;
		assert.ok(below.y - above.y >= NODE_HEIGHT + LAYER_GAP, `${edge.prerequisite} sits a layer or more above ${edge.topic}`);
	}
	for (const layer of layout.layers) {
		for (let i = 1; i < layer.length; i++) {
			const gap = layout.topics.get(layer[i]!)!.x - layout.topics.get(layer[i - 1]!)!.x;
			assert.ok(gap >= NODE_WIDTH + NODE_GAP - 0.5, `${layer[i - 1]} and ${layer[i]} do not overlap`);
		}
	}
}

describe("topic map geometry", () => {
	const layout = layoutTopicMap(MAP.topics, MAP.edges);

	it("puts every prerequisite above the topics that need it, with no overlaps, the same every time", () => {
		assert.equal(layout.topics.size, 16);
		assertDrawable(layout, MAP.edges);
		assert.deepEqual(layout.layers[0], [h("vectors")]);
		assert.deepEqual([...layoutTopicMap(MAP.topics, MAP.edges).topics.values()], [...layout.topics.values()]);
	});

	it("runs each need from the prerequisite's bottom edge to the topic's top edge", () => {
		assert.equal(layout.routes.length, 23);
		for (const route of layout.routes) {
			const from = layout.topics.get(route.prerequisite)!;
			const to = layout.topics.get(route.topic)!;
			assert.deepEqual(route.points[0], [from.x + NODE_WIDTH / 2, from.y + NODE_HEIGHT]);
			assert.deepEqual(route.points.at(-1), [to.x + NODE_WIDTH / 2, to.y]);
		}
	});

	it("takes a need that skips a layer straight down between that layer's topics, never through one", () => {
		const skipping = layout.routes.filter((route) => route.points.length > 2);
		assert.ok(skipping.length >= 4, "the course has needs that skip layers");
		for (const route of skipping) {
			const passes = route.points.slice(1, -1);
			assert.equal(passes.length % 2, 0, "two points per layer passed");
			for (let i = 0; i < passes.length; i += 2) {
				const [x, top] = passes[i]!;
				const [below, bottom] = passes[i + 1]!;
				assert.equal(below, x, "straight down");
				assert.equal(bottom - top, NODE_HEIGHT, "the whole height of the layer");
				for (const placed of layout.topics.values()) {
					if (placed.y !== top) continue;
					const clear = x <= placed.x - NODE_GAP / 2 || x >= placed.x + NODE_WIDTH + NODE_GAP / 2;
					assert.ok(clear, `${route.prerequisite} to ${route.topic} passes clear of ${placed.handle}`);
				}
			}
		}
	});

	it("stacks a course with no needs in one column, in the engine's order", () => {
		const column = layoutTopicMap([topic("a"), topic("b"), topic("c")], []);
		assert.deepEqual(column.layers, [[h("a")], [h("b")], [h("c")]]);
		assert.equal(column.routes.length, 0);
		assert.deepEqual(layoutTopicMap([], []), { node: { width: NODE_WIDTH, height: NODE_HEIGHT }, width: 0, height: 0, topics: new Map(), routes: [], layers: [] });
	});

	it("finds a topic's whole prerequisite chain, itself included", () => {
		assert.deepEqual([...chainOf(h("basis"), MAP.edges)].sort(), ["basis", "independence", "span", "vectors"]);
		assert.deepEqual([...chainOf(h("vectors"), MAP.edges)], ["vectors"]);
	});

	it("walks Up to a prerequisite, Down to a topic that needs it, and along the layer, stopping at the edges", () => {
		assert.ok(["basis", "matmul", "elimination"].includes(neighbourOf(layout, MAP.edges, h("rank"), "ArrowUp")!));
		assert.ok(["kernel", "invertibility", "eigen"].includes(neighbourOf(layout, MAP.edges, h("rank"), "ArrowDown")!));
		const row = layout.layers[layout.topics.get(h("rank"))!.layer]!;
		const at = row.indexOf(h("rank"));
		assert.equal(neighbourOf(layout, MAP.edges, h("rank"), "ArrowLeft"), row[at - 1] ?? null);
		assert.equal(neighbourOf(layout, MAP.edges, h("rank"), "ArrowRight"), row[at + 1] ?? null);
		assert.equal(neighbourOf(layout, MAP.edges, h("vectors"), "ArrowUp"), null);
		assert.equal(neighbourOf(layout, MAP.edges, h("vectors"), "ArrowLeft"), null);
	});
});

describe("where the map opens", () => {
	const layout = layoutTopicMap(MAP.topics, MAP.edges);
	const ROOM = { x: 64, y: 60 };
	/** A topic's box on screen under a camera. */
	const onScreen = (camera: Camera, handle: string) => {
		const placed = layout.topics.get(h(handle))!;
		const left = placed.x * camera.zoom + camera.x;
		const top = placed.y * camera.zoom + camera.y;
		return { left, top, right: left + NODE_WIDTH * camera.zoom, bottom: top + NODE_HEIGHT * camera.zoom };
	};

	it("shows the whole course, clear of the frame's faded edge, when it fits at three quarters or more", () => {
		const frame = { width: 1192, height: 740 };
		const camera = openingCamera(layout, MAP.current, frame, ROOM);
		assert.ok(camera.zoom >= 0.75 && camera.zoom < 1);
		for (const handle of Object.keys(NEEDS)) {
			const box = onScreen(camera, handle);
			assert.ok(box.left >= ROOM.x * camera.zoom - 0.5 && box.right <= frame.width - ROOM.x * camera.zoom + 0.5, `${handle} is in view across`);
			assert.ok(box.top >= ROOM.y * camera.zoom - 0.5 && box.bottom <= frame.height - ROOM.y * camera.zoom + 0.5, `${handle} is in view down`);
		}
	});

	it("opens at full size on the current topic when the course does not fit", () => {
		const frame = { width: 896, height: 350 };
		const camera = openingCamera(layout, MAP.current, frame, ROOM);
		assert.equal(camera.zoom, 1);
		const box = onScreen(camera, "rank");
		assert.ok(Math.abs((box.left + box.right) / 2 - frame.width / 2) <= 0.5, "centred across");
		assert.ok(Math.abs((box.top + box.bottom) / 2 - frame.height / 2) <= 0.5, "centred down");
	});

	it("never looks past the drawing: a current topic on the first layer sits a room's depth under the frame's top", () => {
		const camera = openingCamera(layout, h("vectors"), { width: 896, height: 350 }, ROOM);
		assert.equal(onScreen(camera, "vectors").top, ROOM.y);
	});

	it("centres a drawing narrower than the frame, and opens on the first topic when the course has no current one", () => {
		const chain = layoutTopicMap([topic("a"), topic("b"), topic("c"), topic("d"), topic("e"), topic("f")], edgesOf({ b: ["a"], c: ["b"], d: ["c"], e: ["d"], f: ["e"] }));
		const camera = openingCamera(chain, null, { width: 896, height: 350 }, ROOM);
		assert.deepEqual(camera, { x: (896 - NODE_WIDTH) / 2, y: ROOM.y, zoom: 1 });
	});
});

describe("where a course map opens framed", () => {
	/** A fixed card for the camera's arithmetic, apart from the map's own (canvas-layout.ts; topic-map-framing.test.ts
	 *  frames the map's own drawing), so each case's premise holds whatever the map's card becomes. */
	const CARD = { width: 248, height: 56 };
	const layout = layoutTopicMap(MAP.topics, MAP.edges, CARD);
	const FADE = { x: 64, y: 40 };
	const TAG = 20;
	/** Every topic's box on screen under a camera, sorted into wholly clear of the fade and cut by the frame's edge
	 *  (part of it shows, in the fade or not, and the edge cuts the rest). */
	const sort = (camera: Camera, frame: { width: number; height: number }) => {
		const out = { clear: [] as string[], cut: [] as string[], whole: [] as string[] };
		for (const [handle, at] of layout.topics) {
			const left = at.x * camera.zoom + camera.x;
			const top = at.y * camera.zoom + camera.y;
			const fit = cardFit({ left, top, right: left + CARD.width * camera.zoom, bottom: top + CARD.height * camera.zoom }, frame, FADE);
			if (fit === "cut") out.cut.push(handle);
			else if (fit === "clear") out.clear.push(handle);
			if (fit === "clear" || fit === "faded") out.whole.push(handle);
		}
		return out;
	};
	/** The topics that need one: where he goes next from it. */
	const nextOf = (handle: string) => MAP.edges.flatMap((e) => (e.kind === "needs" && e.prerequisite === handle ? [e.topic as string] : []));

	it("calls a card that shows only in the fade but runs past the frame's edge cut, and one wholly past it out of view", () => {
		const frame = { width: 896, height: 413 };
		assert.equal(cardFit({ left: 842, top: 100, right: 1065, bottom: 150 }, frame, FADE), "cut");
		assert.equal(cardFit({ left: 100, top: -11, right: 323, bottom: 40 }, frame, FADE), "cut");
		assert.equal(cardFit({ left: 896, top: 100, right: 1119, bottom: 150 }, frame, FADE), "out");
		assert.equal(cardFit({ left: 840, top: 100, right: 890, bottom: 150 }, frame, FADE), "faded");
		assert.equal(cardFit({ left: 100, top: 100, right: 323, bottom: 150 }, frame, FADE), "clear");
	});

	it("shows the whole course when it fits at a readable scale", () => {
		const camera = framedCamera(layout, MAP.current, { width: 1600, height: 900 }, FADE, TAG);
		assert.ok(camera.zoom >= READABLE_ZOOM);
		assert.equal(sort(camera, { width: 1600, height: 900 }).clear.length, layout.topics.size);
	});

	it("frames the current topic clear of the fade, with its tag, and the topics it leads to whole", () => {
		const frame = { width: 896, height: 413 };
		const camera = framedCamera(layout, MAP.current, frame, FADE, TAG);
		const { clear, whole } = sort(camera, frame);
		assert.ok(clear.includes("rank"), "the current topic is clear");
		assert.ok(layout.topics.get(h("rank"))!.y * camera.zoom + camera.y - TAG >= FADE.y - 1, "its tag too");
		for (const next of nextOf("rank")) assert.ok(whole.includes(next), `${next}, where he goes next`);
		assert.ok(camera.zoom >= READABLE_ZOOM && camera.zoom <= 1);
	});

	it("opens Linear Algebra on Eigenvalues with the topics it leads to whole, on Home's map and on its course page", () => {
		const home = { width: 896, height: 413 };
		const onHome = sort(framedCamera(layout, h("eigen"), home, FADE, TAG), home);
		assert.ok(onHome.clear.includes("eigen"));
		for (const next of nextOf("eigen")) assert.ok(onHome.whole.includes(next), `${next} on Home`);
		const page = { width: 696, height: 782 };
		const pageFade = { x: 48, y: 32 };
		const onPage = framedCamera(layout, h("eigen"), page, pageFade, TAG, "top");
		const fits = new Map([...layout.topics].map(([handle, at]) => {
			const left = at.x * onPage.zoom + onPage.x;
			const top = at.y * onPage.zoom + onPage.y;
			return [handle as string, cardFit({ left, top, right: left + CARD.width * onPage.zoom, bottom: top + CARD.height * onPage.zoom }, page, pageFade)];
		}));
		assert.equal(fits.get("eigen"), "clear");
		for (const next of nextOf("eigen")) assert.ok(["clear", "faded"].includes(fits.get(next)!), `${next} on its page`);
	});

	it("never moves the camera past the drawing's room to avoid a card cut at the frame's edge (round 5: an empty band under Home's map)", () => {
		const frame = { width: 896, height: 413 };
		const room = { x: FADE.x, y: FADE.y + TAG };
		for (const handle of layout.topics.keys()) {
			const camera = framedCamera(layout, handle, frame, FADE, TAG);
			if (layout.height * camera.zoom + room.y * 2 > frame.height) {
				assert.ok(camera.y <= room.y && camera.y + layout.height * camera.zoom >= frame.height - room.y, `down, opening on ${handle}`);
			}
			if (layout.width * camera.zoom + room.x * 2 > frame.width) {
				assert.ok(camera.x <= room.x && camera.x + layout.width * camera.zoom >= frame.width - room.x, `across, opening on ${handle}`);
			}
		}
	});

	it("opens Probability's course page on where he is, its tag and the topics it leads to clear (the round-3 evaluation)", () => {
		const needs = { "total-probability": ["conditional"], bayes: ["conditional", "total-probability"], independence: ["conditional"], binomial: ["random-variables", "independence"], poisson: ["random-variables"], geometric: ["random-variables", "independence"], expectation: ["random-variables"], variance: ["expectation"], covariance: ["variance", "independence"] };
		const handles = ["conditional", "total-probability", "bayes", "independence", "random-variables", "binomial", "poisson", "geometric", "expectation", "variance", "covariance"];
		const probability = layoutTopicMap(handles.map((handle) => topic(handle)), edgesOf(needs), CARD);
		const page = { width: 696, height: 782 };
		const fade = { x: 48, y: 32 };
		const camera = framedCamera(probability, h("random-variables"), page, fade, TAG, "top");
		const fits = new Map([...probability.topics].map(([handle, at]) => {
			const left = at.x * camera.zoom + camera.x;
			const top = at.y * camera.zoom + camera.y;
			return [handle, cardFit({ left, top, right: left + CARD.width * camera.zoom, bottom: top + CARD.height * camera.zoom }, page, fade)];
		}));
		assert.equal(fits.get(h("random-variables")), "clear");
		assert.ok(probability.topics.get(h("random-variables"))!.y * camera.zoom + camera.y - TAG >= fade.y - 1, "its tag is clear");
		assert.ok(["expectation", "poisson"].every((next) => ["clear", "faded"].includes(fits.get(h(next))!)), "the topics it leads to");
	});

	it("never opens below the scale where a card's 13px title draws at about 11px", () => {
		assert.ok(13 * READABLE_ZOOM >= 10.4);
		for (const frame of [{ width: 896, height: 413 }, { width: 696, height: 782 }, { width: 600, height: 300 }]) {
			assert.ok(framedCamera(layout, MAP.current, frame, FADE, TAG).zoom >= READABLE_ZOOM);
		}
	});

	it("shows more topics than centring the current one at full size would", () => {
		const frame = { width: 784, height: 700 };
		const framed = sort(framedCamera(layout, MAP.current, frame, FADE, TAG), frame);
		const centred = sort(openingCamera(layout, MAP.current, frame, { x: FADE.x, y: FADE.y + TAG }), frame);
		assert.ok(framed.clear.length > centred.clear.length, `${framed.clear.length} against ${centred.clear.length}`);
		assert.ok(framed.cut.length <= centred.cut.length);
	});
});

describe("topic map drawing", () => {
	const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
	const render = (node: React.ReactNode) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
	const said = sidebarSays([{ map: MAP, unready: null, due: [], lastActiveDaysAgo: 0, newToday: [] }], [], MAP.workspace);
	const document = render(<TopicMap map={MAP} said={said} />);
	const nodes = [...document.querySelectorAll('[data-slot="course-map-node"]')];
	const node = (handle: string) => document.querySelector(`[data-testid="map-node-${handle}"]`)!;

	it("draws every topic as a link to its page, named by its title, standing and reason", () => {
		assert.equal(nodes.length, 16);
		assert.ok(nodes.every((n) => n.tagName === "A"));
		assert.equal(node("rank").getAttribute("href"), unitHref(MAP.workspace, "rank"));
		assert.equal(node("rank").getAttribute("aria-label"), "Rank, You are here, Right with help");
		assert.equal(node("rank").getAttribute("aria-description"), "Needs Basis and dimension, Matrix multiplication, Gaussian elimination");
		assert.equal(node("eigen").getAttribute("aria-label"), "eigen, Not started");
	});

	it("shows a title and its pie on every node, and under it what the sidebar says when it needs him, or else where he stands", () => {
		assert.equal(document.querySelectorAll('[data-slot="topic-glyph"]').length, 16);
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="topic-need"]')].map((line) => line.textContent),
			["Due since 29 Oct", "Mistake to fix", "Due today", "Not right last time", "Mixed up with Cramer's rule", "Sure, but wrong"],
		);
		assert.ok(node("determinant").querySelector('[data-slot="topic-need"]') === null);
		assert.equal(node("determinant").querySelector('[data-slot="topic-standing"]')!.textContent, "Right with help");
		assert.equal(node("eigen").querySelector('[data-slot="topic-glyph"]')!.getAttribute("data-fill"), "0");
	});

	it("tags the current topic, keeps one tab stop on it, and opens no popover", () => {
		assert.equal(document.querySelector('[data-slot="course-map-tag"]')!.textContent, "You are here");
		assert.equal(node("rank").getAttribute("aria-current"), "location");
		assert.deepEqual(
			nodes.filter((n) => n.getAttribute("tabindex") === "0").map((n) => n.getAttribute("data-testid")),
			["map-node-rank"],
		);
		assert.equal(document.querySelectorAll('[data-slot="topic-detail"], [data-testid="study-topic"]').length, 0);
		assert.match(document.querySelector("figcaption")!.textContent!, /16 topics.*You are at Rank\./);
	});

	it("keeps You are here and the topics it leads to at full strength while a page lights others, and dims the rest only as far as their words still read (round 5: Diagonalization at 2.8:1)", () => {
		const lit = render(<TopicMap map={MAP} said={said} highlight={new Set([h("basis")])} />);
		const strength = (handle: string) => {
			// The card's link sits in its surface, inside the card that fades.
			const card = lit.querySelector(`[data-testid="map-node-${handle}"]`)!.parentElement!.parentElement!;
			const styled = /opacity:\s*([\d.]+)/.exec(card.getAttribute("style") ?? "")?.[1];
			const classed = /(?:^|\s)opacity-(\d+)(?:\s|$)/.exec(card.getAttribute("class") ?? "")?.[1];
			return styled ? Number(styled) : classed ? Number(classed) / 100 : 1;
		};
		for (const handle of ["basis", "rank", "kernel", "invertibility", "eigen"]) assert.equal(strength(handle), 1, handle);
		const dimmed = strength("diagonalization");
		assert.ok(dimmed < 1, "a topic two steps on dims");
		assert.ok(contrastAt(dimmed) >= 4.5, `its muted line at ${contrastAt(dimmed).toFixed(2)}:1`);
	});

	it("draws its needs as lines hidden from a screen reader, one path at rest", () => {
		const lines = [...document.querySelectorAll('[data-slot="course-map-line"]')];
		assert.equal(lines.length, 1, "every line at rest is one path (map-lines.test.tsx)");
		assert.ok(lines.every((path) => path.getAttribute("d")!.startsWith("M")));
		assert.ok(lines.every((path) => path.closest("[aria-hidden]")), "the needs are read from each node's description");
	});
});
