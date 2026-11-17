/**
 * Every line on a course map reads at one weight (Edo, 16 Nov 2026: "when
 * there are like multiple edges running in same path it makes that tract
 * look thicker which is inconsistent"). Each need was its own translucent
 * stroke, so a bracket two needs share was painted twice and read thicker.
 * The map now draws every line of one ink as one path, at one
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
import { mapEdges } from "../components/course-map/topic-map/map-drawing.ts";
import { LinePaths, inkPaths, snapTo, trackPieces, type CanvasLine } from "../components/course-map/topic-map/canvas/canvas-lines.tsx";
import { focusOf } from "../components/course-map/topic-map/canvas/canvas-focus.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string): CourseMapTopic => ({ handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [] });
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

/** The lines drawn as the edge draws them, unsnapped (a server render). */
const drawnLines = (lines: CanvasLine[]) => <LinePaths pieces={trackPieces(lines, null, null)} snap={null} />;

const draw = (topics: readonly CourseMapTopic[], needs: readonly CourseMapEdge[]) => {
	const layout = layoutCanvas(topics, needs);
	return { layout, edges: mapEdges(layout) };
};

describe("the map's lines", () => {
	it("draws every line as one edge, not one stroke per need", () => {
		const { edges } = draw(TOPICS, NEEDS);
		assert.equal(edges.length, 1);
		assert.equal(edges[0]!.type, "canvasLines");
	});

	it("strokes a run several needs share once: at rest every line is one path", () => {
		const { layout } = draw(TOPICS, NEEDS);
		const lines: CanvasLine[] = layout.routes.map((r) => ({ key: `${r.prerequisite}>${r.topic}`, points: r.points, prerequisite: r.prerequisite, topic: r.topic }));
		const all = lines.flatMap((l) => steps(`M${l.points.map((p) => p.join(",")).join(" L")}`));
		assert.ok(new Set(all).size < all.length, "the fixture has needs that share a run");
		const paths = inkPaths(lines, null, null);
		assert.deepEqual([...paths.keys()], ["rest"]);
		const markup = renderToStaticMarkup(<svg>{drawnLines(lines)}</svg>);
		const { document } = parseHTML(`<html><body>${markup}</body></html>`);
		const drawn = [...document.querySelectorAll('[data-slot="course-map-line"]')];
		assert.equal(drawn.length, 1, "one path for every line at rest");
		assert.equal(drawn[0]!.getAttribute("stroke-width"), "1");
		const zoomed = parseHTML(`<html><body>${renderToStaticMarkup(<svg><LinePaths pieces={trackPieces(lines, null, null)} snap={null} scale={0.8} /></svg>)}</body></html>`).document;
		assert.equal(zoomed.querySelector('[data-slot="course-map-line"]')!.getAttribute("stroke-width"), "1.25", "1 screen pixel at the camera's zoom");
		assert.match(drawn[0]!.getAttribute("class") ?? "", /^stroke-map-line$/);
	});

	it("keeps one width when a topic is in focus, lit and receded lines each one path", () => {
		const { layout } = draw(TOPICS, NEEDS);
		const lines: CanvasLine[] = layout.routes.map((r) => ({ key: `${r.prerequisite}>${r.topic}`, points: r.points, prerequisite: r.prerequisite, topic: r.topic }));
		const focus = focusOf(h("c"), NEEDS, layout.routes);
		const paths = inkPaths(lines, focus, null);
		assert.deepEqual([...paths.keys()].sort(), ["lit", "receded"]);
	});

	it("draws a stretch two inks share once, in the brighter ink", () => {
		// A receded line and a lit one (the chain of a and c) run down the same stretch into one card.
		const lines: CanvasLine[] = [
			{ key: "x>c", points: [[100, 0], [100, 200]], prerequisite: h("x"), topic: h("c") },
			{ key: "a>c", points: [[100, 120], [100, 200]], prerequisite: h("a"), topic: h("c") },
		];
		const pieces = trackPieces(lines, null, new Set([h("a"), h("c")]));
		const runs = (ink: "lit" | "receded") => (pieces.get(ink) ?? []).map((p) => (p.kind === "run" ? [p.at, p.from, p.to] : null));
		assert.deepEqual(runs("lit"), [[100, 120, 200]]);
		assert.deepEqual(runs("receded"), [[100, 0, 120]], "the receded ink stops where the lit line takes the stretch");
	});

	it("draws a run several lines share once, whatever their corners", () => {
		const lines: CanvasLine[] = [
			{ key: "a>b", points: [[0, 0], [0, 100]], prerequisite: h("a"), topic: h("b") },
			{ key: "a>c", points: [[0, 0], [0, 50], [80, 50], [80, 100]], prerequisite: h("a"), topic: h("c") },
		];
		const rest = trackPieces(lines, null, null).get("rest")!;
		const vertical = rest.filter((p) => p.kind === "run" && p.vertical && p.at === 0);
		assert.equal(vertical.length, 1, "the shared trunk is one run");
		assert.deepEqual(vertical[0]!.kind === "run" && [vertical[0]!.from, vertical[0]!.to], [0, 100]);
	});

	it("snaps every line onto whole device pixels at any camera", () => {
		for (const [camera, dpr] of [[[13.37, -4.2, 0.837], 2], [[0.5, 0.25, 1], 1], [[-220.1, 33.3, 0.62], 2]] as const) {
			const snap = snapTo(camera, dpr);
			for (const v of [0, 17.25, 403.3333, 1000.5]) {
				const device = (snap(v, "x") * camera[2] + camera[0]) * dpr;
				// One CSS pixel covers `dpr` device pixels: on a 2x screen the centre sits on a pixel edge, on a 1x screen mid-pixel.
				const off = dpr % 2 === 1 ? 0.5 : 0;
				assert.ok(Math.abs(device - off - Math.round(device - off)) < 1e-6, `${v} at ${camera.join(",")} lands on the grid`);
				assert.ok(Math.abs(snap(v, "x") - v) * camera[2] <= 0.5 / dpr + 1e-9, "moved at most half a device pixel");
			}
		}
	});

	it("paints its inks opaque, so nothing a line overlaps shows through or adds up", () => {
		const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
		for (const token of ["--lh-map-line", "--lh-map-line-lit", "--lh-map-line-receded"]) {
			const value = new RegExp(`${token}:\\s*([^;]+);`).exec(css)?.[1] ?? "";
			assert.match(value, /^color-mix\(in srgb, white \d+%, var\(--background\)\)$/, `${token} mixes white into the page, opaque`);
		}
		assert.match(css, /--background: #[0-9a-f]{6};/, "the page itself is opaque");
	});
});

