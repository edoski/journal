/**
 * Tree and neighbours (neighbours.md; Edo, 16 Nov 2026): one arc drawn
 * exactly as Canvas tree draws it, a faded band for the arc before above
 * it (its cards' bottoms, with faded lines into this arc) and one for the
 * arc after below it (its first cards' tops, with faded lines from this
 * arc), each only when that arc exists, and a press on a faded card or a
 * band loading that arc.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dom } from "./helpers/radix-dom.ts";
(globalThis as Record<string, unknown>).self = globalThis;
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import type { ArcHandle, CourseMap, CourseMapEdge, TopicHandle } from "../src/core/index.ts";
import { arcView } from "../components/course-map/topic-map/arc-view.ts";
import { drawingOf } from "../components/course-map/topic-map/map-skin.ts";
import { TREE_SKIN } from "../components/course-map/topic-map/canvas/canvas-skin.ts";
import { CANVAS_NODE } from "../components/course-map/topic-map/canvas/canvas-layout.ts";
import { NEIGHBOURS_SKIN, drawingOfLayout } from "../components/course-map/topic-map/neighbours/neighbours-skin.ts";
import { NeighbourBandNode, NeighbourCardNode, type NeighbourBandFlowNode, type NeighbourCardFlowNode } from "../components/course-map/topic-map/neighbours/neighbour-nodes.tsx";
import { TopicMapContext, type TopicMapState } from "../components/course-map/topic-map/topic-node.tsx";
import { LINALG_ARCS } from "./fixtures/now-demo.ts";

const h = (handle: string) => handle as TopicHandle;
const a = (handle: string) => handle as ArcHandle;
const needs = (pairs: Array<[string, string]>): CourseMapEdge[] => pairs.map(([p, t]) => ({ kind: "needs", prerequisite: h(p), topic: h(t) }));
// Vector spaces (vectors, independence) → Linear systems (rank, det) → Eigenvalues (eigen, diag).
const MAP: CourseMap = { ...LINALG_ARCS.map, edges: needs([["vectors", "independence"], ["independence", "rank"], ["rank", "det"], ["rank", "eigen"], ["det", "eigen"], ["eigen", "diag"]]) };
const { W, H } = { W: CANVAS_NODE.width, H: CANVAS_NODE.height };

const draw = (arc: string) => drawingOf(NEIGHBOURS_SKIN, MAP, a(arc));

describe("Tree and neighbours' drawing", () => {
	it("draws the arc exactly as Canvas tree does, only moved down under the band before", () => {
		const tree = drawingOf(TREE_SKIN, MAP, a("systems")).layout;
		const { layout } = draw("systems");
		const shift = layout.topics.get(h("rank"))!.y - tree.topics.get(h("rank"))!.y;
		assert.ok(shift > 0, "room for the band above");
		for (const handle of ["rank", "det"]) {
			assert.equal(layout.topics.get(h(handle))!.x, tree.topics.get(h(handle))!.x, `${handle} keeps its column`);
			assert.equal(layout.topics.get(h(handle))!.y, tree.topics.get(h(handle))!.y + shift, `${handle} keeps its row`);
		}
	});

	it("lifts the arc before's cards out of the top layer into the faded band, with their lines into this arc", () => {
		const { layout } = draw("systems");
		const drawing = drawingOfLayout(layout)!;
		assert.ok(layout.topics.get(h("independence")) === undefined, "no longer one of the arc's own cards");
		const before = drawing.bands.find((b) => b.side === "before")!;
		assert.equal(before.arc.handle, "spaces");
		assert.deepEqual(before.cards.map((c) => c.topic.handle), ["independence"]);
		const line = drawing.lines.find((l) => l.prerequisite === "independence" && l.topic === "rank")!;
		assert.ok(line, "its line runs into the arc");
		assert.equal(line.points[0]![1], before.bottom, "out of its card's cut edge");
		assert.equal(line.points.at(-1)![1], layout.topics.get(h("rank"))!.y, "into the arc's card");
	});

	it("puts the arc after's first cards in a band below, fed by faded lines that pass no card", () => {
		const { layout } = draw("systems");
		const drawing = drawingOfLayout(layout)!;
		const after = drawing.bands.find((b) => b.side === "after")!;
		assert.equal(after.arc.handle, "eigenvalues");
		assert.deepEqual(after.cards.map((c) => c.topic.handle), ["eigen"]);
		const into = drawing.lines.filter((l) => l.topic === "eigen");
		assert.ok(into.length > 0);
		for (const l of into) {
			l.points.slice(1).forEach(([x, y], k) => {
				const [x0, y0] = l.points[k]!;
				for (const box of layout.topics.values()) {
					if (x0 === x) assert.ok(!(x > box.x && x < box.x + W && Math.max(y0, y) > box.y + 1 && Math.min(y0, y) < box.y + H - 1), `${l.prerequisite}>eigen passes ${box.handle}`);
				}
			});
		}
	});

	it("draws a band only for an arc that exists", () => {
		const first = drawingOfLayout(draw("spaces").layout)!;
		assert.deepEqual(first.bands.map((b) => b.side), ["after"]);
		const last = drawingOfLayout(draw("eigenvalues").layout)!;
		assert.deepEqual(last.bands.map((b) => b.side), ["before"]);
	});

	it("draws Canvas tree alone for a course without arcs", () => {
		const plain: CourseMap = { ...MAP, arcs: undefined };
		const { layout } = drawingOf(NEIGHBOURS_SKIN, plain, undefined);
		assert.equal(drawingOfLayout(layout), undefined);
		assert.equal(layout.topics.size, arcView(plain, undefined).map.topics.length);
	});
});

describe("Tree and neighbours' presses", () => {
	let root: Root | null = null;
	let host: HTMLDivElement | null = null;
	afterEach(async () => {
		await act(async () => root?.unmount());
		host?.remove();
		root = host = null;
	});
	async function mount(node: React.ReactNode, opened: string[]) {
		const state: TopicMapState = { lit: null, marked: null, tabStop: null, onActive: () => {}, onFocus: () => {}, onKeyDown: () => {}, register: () => {}, openArc: (arc) => opened.push(arc) };
		host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		await act(async () => root!.render(<ReactFlowProvider><TopicMapContext.Provider value={state}>{node}</TopicMapContext.Provider></ReactFlowProvider>));
	}
	const click = (el: Element) => act(async () => void el.dispatchEvent(new dom.window.Event("click", { bubbles: true }) as unknown as Event));

	it("loads the arc of a faded card he presses", async () => {
		const drawing = drawingOfLayout(draw("systems").layout)!;
		const band = drawing.bands.find((b) => b.side === "after")!;
		const opened: string[] = [];
		const props = { data: { topic: band.cards[0]!.topic, arc: band.arc.handle, arcTitle: band.arc.title, side: band.side } } as unknown as NodeProps<NeighbourCardFlowNode>;
		await mount(<NeighbourCardNode {...props} />, opened);
		await click(document.querySelector('[data-slot="neighbour-card"]')!);
		assert.deepEqual(opened, ["eigenvalues"]);
	});

	it("loads the arc of a band he presses, named quietly by its number and whole name", async () => {
		const drawing = drawingOfLayout(draw("systems").layout)!;
		const band = drawing.bands.find((b) => b.side === "before")!;
		const opened: string[] = [];
		const props = { data: { band }, positionAbsoluteX: 0 } as unknown as NodeProps<NeighbourBandFlowNode>;
		await mount(<NeighbourBandNode {...props} />, opened);
		const el = document.querySelector('[data-slot="neighbour-band"]')!;
		assert.equal(el.querySelector('[data-slot="arc-label"]')!.textContent, "1Vector spaces");
		assert.ok(el.querySelector('[data-slot="arc-pill"]') === null, "never a pill");
		await click(el);
		assert.deepEqual(opened, ["spaces"]);
	});
});
