/**
 * Stacked arcs (stack.md; Edo, 16 Nov 2026): each arc exactly as Canvas
 * tree draws it, the arcs stacked in study order and disconnected, one arc
 * framed at a time, and ⇧↑ ⇧↓ that glide one arc up or down; Home picks
 * the arc with the quiet selector Bands uses.
 * The glide itself is probed in the running app.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dom } from "./helpers/radix-dom.ts";
(globalThis as Record<string, unknown>).self = globalThis;
import { createRoot, type Root } from "./helpers/app-render.tsx";
import type { ArcHandle, CourseMap } from "../src/core/index.ts";
import { ARC_GAP, arcStep, drawingOf, trailOf } from "../components/course-map/topic-map/map-skin.ts";
import { TREE_SKIN } from "../components/course-map/topic-map/canvas/canvas-skin.ts";
import { STACK_SKIN } from "../components/course-map/topic-map/stack/stack-skin.ts";
import type { CanvasLine } from "../components/course-map/topic-map/canvas/canvas-lines.tsx";
import { MAP_STYLE_OPTIONS } from "../components/course-map/topic-map/map-style.ts";
import { useArcKeys } from "../components/course-map/arc-keys.ts";
import { DEMO_ARC_COURSES, DEMO_LINEAR_ALGEBRA, DEMO_PROBABILITY } from "./fixtures/demo-arcs.ts";

const arcsOf = (course: CourseMap) => course.arcs!.map((a) => a.handle);
const linesOf = (course: CourseMap, layout: ReturnType<typeof drawingOf>["layout"], trail: Parameters<NonNullable<typeof STACK_SKIN.edges>>[2] = null) =>
	(STACK_SKIN.edges!(course, layout, trail)[0]?.data as { lines: readonly CanvasLine[] } | undefined)?.lines ?? [];

describe("Stacked arcs' drawing", () => {
	it("replaces Tree and neighbours in the switch", () => {
		assert.ok(MAP_STYLE_OPTIONS.includes("stack"));
		assert.ok(!(MAP_STYLE_OPTIONS as readonly string[]).includes("neighbours"));
	});

	it("is Canvas tree's skin, so its places, lines, focus and camera are Tree's own code", () => {
		for (const key of ["layout", "edgeTypes", "topicType", "edgeType", "handles", "tagRoom", "neighbour", "Frame", "Chrome", "panOnScroll", "fixedWhenFits", "maxZoom"] as const) assert.equal(STACK_SKIN[key], TREE_SKIN[key], key);
		assert.equal(STACK_SKIN.grouped, undefined, "one arc at a time, never the whole course with arcs marked off");
	});

	for (const course of DEMO_ARC_COURSES) {
		it(`${course.title}: draws every arc exactly as Tree draws it, lines and all`, () => {
			for (const arc of arcsOf(course)) {
				const tree = drawingOf(TREE_SKIN, course, arc).layout;
				const stack = drawingOf(STACK_SKIN, course, arc).layout;
				assert.deepEqual(stack, tree, arc);
				assert.deepEqual(STACK_SKIN.edges!(course, stack), TREE_SKIN.edges!(course, tree), `${arc}: Tree's lines`);
			}
		});

		it(`${course.title}: frames one arc at rest, and no line runs between two arcs while the camera glides`, () => {
			const arcs = arcsOf(course);
			for (let i = 0; i + 1 < arcs.length; i++) {
				for (const [from, to] of [[arcs[i]!, arcs[i + 1]!], [arcs[i + 1]!, arcs[i]!]] as const) {
					const shown = drawingOf(STACK_SKIN, course, to).layout;
					const trail = trailOf(STACK_SKIN, course, from, to, shown)!;
					const below = from === arcs[i + 1];
					assert.equal(below ? trail.dy - shown.height : -(trail.dy + trail.layout.height), ARC_GAP, `${from} sits ${below ? "below" : "above"} ${to}, one gap away`);
					assert.equal(trail.dx + trail.layout.width / 2, shown.width / 2, "both on one vertical axis");
					const inShown = (y: number) => y >= 0 && y <= shown.height;
					const inTrail = (y: number) => y >= trail.dy && y <= trail.dy + trail.layout.height;
					const lines = linesOf(course, shown, trail);
					assert.ok(lines.length > 0);
					for (const line of lines) {
						const ys = line.points.map(([, y]) => y);
						assert.ok(ys.every(inShown) || ys.every(inTrail), `${line.key} stays inside one arc`);
					}
					assert.equal(STACK_SKIN.edges!(course, shown, trail).length, 1, "the trail's lines are drawn by the arc's one lines edge, at one width");
				}
			}
			// At rest nothing but the shown arc is drawn.
			const at = drawingOf(STACK_SKIN, course, arcs[0]).layout;
			assert.deepEqual(linesOf(course, at), linesOf(course, at, null));
		});
	}

	it("steps one arc at a time, and stops at either end", () => {
		const arcs = arcsOf(DEMO_LINEAR_ALGEBRA);
		assert.equal(arcStep(DEMO_LINEAR_ALGEBRA, arcs[0], -1), null);
		assert.equal(arcStep(DEMO_LINEAR_ALGEBRA, arcs[0], 1)?.handle, arcs[1]);
		assert.equal(arcStep(DEMO_LINEAR_ALGEBRA, arcs.at(-1), 1), null);
		assert.equal(trailOf(STACK_SKIN, DEMO_PROBABILITY, arcsOf(DEMO_PROBABILITY)[0]!, arcsOf(DEMO_PROBABILITY)[0]!, drawingOf(STACK_SKIN, DEMO_PROBABILITY, arcsOf(DEMO_PROBABILITY)[0]).layout), null);
	});
});

describe("Stacked arcs' keys", () => {
	let root: Root | null = null;
	let host: HTMLDivElement | null = null;
	afterEach(async () => {
		await act(async () => root?.unmount());
		host?.remove();
		root = host = null;
	});
	const arcs = DEMO_LINEAR_ALGEBRA.arcs!;

	async function mount(value: ArcHandle) {
		const picked: ArcHandle[] = [];
		host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		let shown = value;
		function Keys() {
			useArcKeys(arcs, shown, (arc) => (picked.push(arc), (shown = arc), draw()), true);
			return null;
		}
		const draw = () => root!.render(<Keys />);
		await act(async () => draw());
		return picked;
	}
	const keydown = (key: string, shiftKey: boolean) => Object.assign(new dom.window.Event("keydown", { bubbles: true, cancelable: true }), { key, shiftKey, altKey: false, metaKey: false, ctrlKey: false }) as unknown as Event;
	const key = (k: string, shiftKey = true) =>
		act(async () => {
			document.body.dispatchEvent(keydown(k, shiftKey));
		});

	it("⇧↑ and ⇧↓ move one arc, and plain arrows are left to the page", async () => {
		const picked = await mount(arcs[1]!.handle);
		await key("ArrowDown");
		await key("ArrowDown");
		await key("ArrowUp");
		await key("ArrowDown", false);
		assert.deepEqual(picked, [arcs[2]!.handle, arcs[3]!.handle, arcs[2]!.handle]);
	});

	it("stops at the first arc and the last", async () => {
		const first = await mount(arcs[0]!.handle);
		await key("ArrowUp");
		assert.deepEqual(first, []);
		await act(async () => root?.unmount());
		host?.remove();
		const last = await mount(arcs.at(-1)!.handle);
		await key("ArrowDown");
		assert.deepEqual(last, []);
	});

	it("never fires while he types in a field", async () => {
		const picked = await mount(arcs[1]!.handle);
		const field = document.createElement("input");
		document.body.appendChild(field);
		await act(async () => {
			field.dispatchEvent(keydown("ArrowDown", true));
		});
		field.remove();
		assert.deepEqual(picked, []);
	});
});
