/**
 * Every line on a course map reads at one weight (Edo, 16 Nov 2026: "when
 * there are like multiple edges running in same path it makes that tract
 * look thicker which is inconsistent"). Each need was its own translucent
 * stroke, so a bracket two needs share was painted twice and read thicker.
 * The canvas styles now draw every line of one ink as one path, at one
 * width, in an opaque ink: a run several lines share is stroked once.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import type { CourseMapEdge, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { layoutCanvas } from "../components/course-map/topic-map/canvas/canvas-layout.ts";
import { TREE_SKIN } from "../components/course-map/topic-map/canvas/canvas-skin.ts";
import { BANDS_SKIN } from "../components/course-map/topic-map/bands/bands-skin.ts";
import { REGIONS_SKIN } from "../components/course-map/topic-map/regions/regions-skin.ts";
import { CanvasLinesEdge, inkPaths, type CanvasLine, type CanvasLinesFlowEdge } from "../components/course-map/topic-map/canvas/canvas-lines.tsx";
import type { EdgeProps } from "@xyflow/react";
import { focusOf } from "../components/course-map/topic-map/canvas/canvas-focus.ts";
import type { MapSkin } from "../components/course-map/topic-map/map-skin.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, arc?: string): CourseMapTopic => ({ handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...(arc ? { arc: arc as never } : {}) });
const needsOf = (needs: Record<string, string[]>): CourseMapEdge[] => Object.entries(needs).flatMap(([t, ps]) => ps.map((p) => ({ kind: "needs" as const, prerequisite: h(p), topic: h(t) })));

// Two prerequisites that both feed two topics: their brackets share the lane into each card.
const TOPICS = ["a", "b", "c", "d"].map((t) => topic(t));
const NEEDS = needsOf({ c: ["a", "b"], d: ["a", "b"] });

/** Every horizontal unit step of a path's straight runs, as "x:y". */
function steps(d: string): string[] {
	const out: string[] = [];
	for (const sub of d.split(/(?=M)/)) {
		const pts = [...sub.matchAll(/[ML]\s*([\d.-]+),([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
		pts.slice(1).forEach(([x, y], i) => {
			const [px, py] = pts[i]!;
			if (py !== y) return;
			for (let at = Math.min(px, x); at < Math.max(px, x); at++) out.push(`${at}:${y}`);
		});
	}
	return out;
}

/** What React Flow hands the lines edge: only its data matters to it. */
const edgeProps = (lines: CanvasLine[]) => ({ data: { lines } }) as unknown as EdgeProps<CanvasLinesFlowEdge>;

const draw = (skin: MapSkin, topics: readonly CourseMapTopic[], needs: readonly CourseMapEdge[]) => {
	const layout = skin.layout(topics, needs, new Set());
	return { layout, edges: skin.edges!({} as never, layout) };
};

describe("the map's lines", () => {
	for (const [name, skin] of [["tree", TREE_SKIN], ["regions", REGIONS_SKIN], ["bands", BANDS_SKIN]] as const) {
		it(`${name}: draws every line as one edge, not one stroke per need`, () => {
			const { edges } = draw(skin, TOPICS, NEEDS);
			assert.equal(edges.length, 1);
			assert.equal(edges[0]!.type, "canvasLines");
		});
	}

	it("strokes a run several needs share once: at rest every line is one path", () => {
		const { layout } = draw(TREE_SKIN, TOPICS, NEEDS);
		const lines: CanvasLine[] = layout.routes.map((r) => ({ key: `${r.prerequisite}>${r.topic}`, points: r.points, prerequisite: r.prerequisite, topic: r.topic }));
		const all = lines.flatMap((l) => steps(`M${l.points.map((p) => p.join(",")).join(" L")}`));
		assert.ok(new Set(all).size < all.length, "the fixture has needs that share a run");
		const paths = inkPaths(lines, null, null);
		assert.deepEqual([...paths.keys()], ["rest"]);
		const markup = renderToStaticMarkup(<svg><CanvasLinesEdge {...edgeProps(lines)} /></svg>);
		const { document } = parseHTML(`<html><body>${markup}</body></html>`);
		const drawn = [...document.querySelectorAll('[data-slot="course-map-line"]')];
		assert.equal(drawn.length, 1, "one path for every line at rest");
		assert.equal(drawn[0]!.getAttribute("stroke-width"), "1");
		assert.match(drawn[0]!.getAttribute("class") ?? "", /^stroke-map-line$/);
	});

	it("keeps one width when a topic is in focus, lit and receded lines each one path", () => {
		const { layout } = draw(TREE_SKIN, TOPICS, NEEDS);
		const lines: CanvasLine[] = layout.routes.map((r) => ({ key: `${r.prerequisite}>${r.topic}`, points: r.points, prerequisite: r.prerequisite, topic: r.topic }));
		const focus = focusOf(h("c"), NEEDS, layout.routes);
		const markup = renderToStaticMarkup(<svg><CanvasLinesEdge {...edgeProps(lines)} /></svg>);
		assert.ok(markup.length > 0);
		const paths = inkPaths(lines, focus, null);
		assert.deepEqual([...paths.keys()].sort(), ["lit", "receded"]);
	});

	it("paints its inks opaque, so nothing a line overlaps shows through or adds up", () => {
		const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
		for (const token of ["--lh-map-line", "--lh-map-line-lit", "--lh-map-line-receded"]) {
			const value = new RegExp(`${token}:\\s*([^;]+);`).exec(css)?.[1] ?? "";
			assert.match(value, /^color-mix\(in srgb, white \d+%, var\(--background\)\)$/, `${token} mixes white into the page, opaque`);
		}
		assert.match(css, /--background: #[0-9a-f]{6};/, "the page itself is opaque");
	});

	it("draws the lines between arcs in the same paths as the needs", () => {
		const topics = [topic("a", "one"), topic("b", "one"), topic("c", "two"), topic("d", "two")];
		const arcs = { arcs: [{ handle: "one", title: "One", state: "learning", entry: [] }, { handle: "two", title: "Two", state: "learning", entry: [] }] as never, open: new Set(["one", "two"]) as never, current: "one" as never };
		const layout = REGIONS_SKIN.layout(topics, needsOf({ b: ["a"], c: ["b"], d: ["c"] }), new Set(), arcs);
		const edges = REGIONS_SKIN.edges!({} as never, layout);
		assert.equal(edges.length, 1);
		const lines = (edges[0]!.data as { lines: CanvasLine[] }).lines;
		assert.ok(lines.some((l) => l.needs), "the line from one arc to the next is among them");
	});
});

void layoutCanvas;
