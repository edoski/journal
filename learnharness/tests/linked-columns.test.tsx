/**
 * The linked columns (components/linked-columns/linked-columns.md): the
 * list beside the map on the course page and the topic page, the Link
 * switch that draws the tie, and the tie's route, whose rules are asserted
 * on the geometry itself: it leaves the row's vertical centre, arrives
 * square to the node's near edge, never runs along a column edge and never
 * passes through another node. Same tsx classic-JSX shim as the other
 * render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { LINK_OPTIONS, POLISH_GROUPS } from "../components/design-variant.ts";
import { LinkedColumns } from "../components/linked-columns/linked-columns.tsx";
import { CLEARANCE, GUTTER_RUN, cubicAt, gutterRun, routeTie, sampleCubic, segmentHits, type Box, type Point, type TieGeometry } from "../components/linked-columns/tie-route.ts";
import { tieOf } from "../components/course-page/split/split-tie.ts";

/** The route's cubic, read back from its path. */
function curveOf(d: string): [Point, Point, Point, Point] {
	const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
	assert.equal(n.length, 8, d);
	return [
		{ x: n[0]!, y: n[1]! },
		{ x: n[2]!, y: n[3]! },
		{ x: n[4]!, y: n[5]! },
		{ x: n[6]!, y: n[7]! },
	];
}

const box = (left: number, top: number, width = 188, height = 54): Box => ({ left, top, right: left + width, bottom: top + height });
const grow = (b: Box, by: number): Box => ({ left: b.left - by, top: b.top - by, right: b.right + by, bottom: b.bottom + by });

/** Every rule the tie keeps, checked on the curve it draws. */
function assertRules(geometry: TieGeometry) {
	const route = routeTie(geometry)!;
	assert.ok(route, "a route");
	assert.equal(route.clear, true, "clear");
	const curve = curveOf(route.d);
	const points = sampleCubic(curve, 200);
	// From the row's vertical centre, heading right.
	assert.deepEqual([Math.round(curve[0].x), Math.round(curve[0].y * 10) / 10], [geometry.from.x, Math.round(geometry.from.y * 10) / 10]);
	assert.ok(Math.abs(curve[1].y - curve[0].y) < 0.11 && curve[1].x > curve[0].x, "leaves heading right");
	// Square onto the node's near edge.
	const { to } = geometry;
	const end = curve[3];
	if (route.side === "left") {
		assert.ok(Math.abs(end.x - to.left) < 0.11 && Math.abs(end.y - (to.top + to.bottom) / 2) < 0.11, "the left edge's middle");
		assert.ok(Math.abs(curve[2].y - end.y) < 0.11 && curve[2].x < end.x, "arrives level");
	} else {
		const y = route.side === "top" ? to.top : to.bottom;
		assert.ok(Math.abs(end.y - y) < 0.11 && end.x > to.left && end.x < to.right, `on the ${route.side} edge`);
		assert.ok(Math.abs(curve[2].x - end.x) < 0.11, "arrives square");
		assert.equal(route.side, geometry.from.y < to.top ? "top" : "bottom", "the edge facing the row");
	}
	// Never back towards the list, never along a column edge, never through a node.
	assert.ok(points.every((p, i) => i === 0 || p.x >= points[i - 1]!.x - 0.01), "always rightwards");
	assert.ok(gutterRun(points, geometry.gutter) <= GUTTER_RUN, `gutter run ${gutterRun(points, geometry.gutter)}`);
	for (const node of geometry.obstacles) {
		const wall = grow(node, CLEARANCE - 0.5);
		assert.ok(!points.some((p, i) => i > 0 && segmentHits(points[i - 1]!, p, wall)), `clear of ${JSON.stringify(node)}`);
	}
	assert.ok(!points.slice(0, -8).some((p, i) => i > 0 && segmentHits(points[i - 1]!, p, to)), "not through its own node");
	return route;
}

const GUTTER = { left: 384, right: 408 };
const FROM = { x: 396, y: 120 };

describe("the tie's route", () => {
	it("crosses the gutter in one S into the left edge of a node beside the row", () => {
		const route = assertRules({ from: FROM, to: box(480, 100), obstacles: [box(480, 200), box(690, 100)], gutter: GUTTER });
		assert.equal(route.side, "left");
	});

	it("goes round a neighbour sitting between the row and the node's left edge: into the top edge, from above", () => {
		// The course page's case: a neighbour on the node's layer, the row above the layer.
		const route = assertRules({ from: { x: 396, y: 140 }, to: box(760, 230, 248, 56), obstacles: [box(480, 230, 248, 56), box(1030, 230, 248, 56), box(620, 380, 248, 56)], gutter: GUTTER });
		assert.equal(route.side, "top");
	});

	it("goes round a neighbour from below, into the bottom edge, when the row sits under the node", () => {
		const route = assertRules({ from: { x: 396, y: 520 }, to: box(760, 230, 248, 56), obstacles: [box(480, 230, 248, 56)], gutter: GUTTER });
		assert.equal(route.side, "bottom");
	});

	it("sweeps down to a step far below through the room the map leaves, passing under the step above it", () => {
		// The Eigenvalues page, its plan drawn against the frame's right edge: the Now row at the top, the step it stopped on at the bottom.
		const shift = 104;
		const at = (left: number, top: number) => box(left + shift, top);
		assertRules({ from: { x: 396, y: 68.2 }, to: at(566, 518), obstacles: [at(566, 115), at(566, 216), at(566, 317), at(670, 418), at(462, 418), at(566, 619)], gutter: GUTTER });
	});

	it("never runs down the gutter: a node far below, right against it, is reached from above, its fall well inside the map", () => {
		const route = assertRules({ from: FROM, to: box(420, 600), obstacles: [], gutter: GUTTER });
		assert.equal(route.side, "top");
		assert.ok(curveOf(route.d)[3].x > GUTTER.right + 32, "its fall well inside the map");
		assert.equal(routeTie({ from: FROM, to: box(420, 600, 40), obstacles: [], gutter: GUTTER })!.clear, false, "a node too narrow to fall into away from the gutter");
	});

	it("marks a route it cannot keep clear, crossing as few nodes as it can", () => {
		const wall = Array.from({ length: 8 }, (_, i) => box(430, 20 + i * 70, 300, 60));
		const route = routeTie({ from: FROM, to: box(800, 300), obstacles: wall, gutter: GUTTER })!;
		assert.equal(route.clear, false);
		assert.match(route.d, /^M 396 120 C /);
	});

	it("draws nothing to a node behind the row", () => {
		assert.equal(routeTie({ from: FROM, to: box(100, 100), obstacles: [], gutter: GUTTER }), null);
	});

	it("measures a segment against a box, and a curve's points", () => {
		assert.equal(segmentHits({ x: 0, y: 0 }, { x: 10, y: 10 }, box(4, 4, 2, 2)), true);
		assert.equal(segmentHits({ x: 0, y: 0 }, { x: 10, y: 0 }, box(4, 4, 2, 2)), false);
		assert.deepEqual(cubicAt([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 10 }], 0.5), { x: 5, y: 5 });
	});
});

describe("the linked columns", () => {
	const render = (connected: boolean, tie = { key: "a", row: "[data-shown]", node: "[aria-current]" }) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<LinkedColumns data-slot="topic-panes" connected={connected} tie={tie} list={<div data-slot="topic-history" />} map={<div data-slot="topic-lesson-map" />} />)}</body></html>`).document;

	it("lays the list beside the map with nothing around them, keeping the page's slot", () => {
		const root = render(false).querySelector('[data-slot="topic-panes"]')!;
		assert.match(root.getAttribute("class")!, /grid-cols-\[minmax\(0,24rem\)_minmax\(0,1fr\)\]/);
		assert.match(root.getAttribute("class")!, /gap-6/);
		assert.doesNotMatch(root.getAttribute("class")!, /border|rounded|bg-/, "no frame and no fill");
		assert.ok(root.querySelector('[data-slot="topic-history"]') && root.querySelector('[data-slot="topic-lesson-map"]'));
	});

	it("draws the tie only when connected, in the map's edge ink, under both columns", () => {
		assert.equal(render(false).querySelector('[data-slot="linked-tie"]'), null);
		const tie = render(true).querySelector('[data-slot="linked-tie"]')!;
		assert.match(tie.getAttribute("class")!, /stroke-white\/33/);
		assert.equal(tie.getAttribute("stroke-width"), "1");
		assert.match(tie.getAttribute("class")!, /motion-safe:animate-\[lh-tie-draw_180ms/, "draws in under 200ms, only where motion is welcome");
		assert.equal(tie.closest("svg")!.nextElementSibling!.querySelector('[data-slot="topic-history"]') !== null, true, "drawn before the columns, so the nodes paint over it");
	});

	it("draws no tie with nothing selected", () => {
		const doc = parseHTML(`<html><body>${renderToStaticMarkup(<LinkedColumns connected tie={null} list={<div />} map={<div />} />)}</body></html>`).document;
		assert.equal(doc.querySelector('[data-slot="linked-tie"]'), null);
	});

	it("ties a course row to its card by the topic's handle", () => {
		assert.deepEqual(tieOf("chain-rule" as never), { key: "chain-rule", row: '[data-slot="course-topic-row"][data-topic="chain-rule"]', node: '.react-flow__node[data-id="chain-rule"] [data-slot="course-map-node"]' });
	});
});

describe("the Link switch", () => {
	it("offers Current (no tie) and Connected, needing no other switch", () => {
		assert.deepEqual(LINK_OPTIONS, ["connected"]);
		assert.equal(POLISH_GROUPS.find((group) => group.id === "link")?.requires, undefined);
		assert.equal(POLISH_GROUPS.length, 1, "the app's only switch");
	});
});
