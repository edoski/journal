/**
 * Round 19, m13 (a): a map draws a line only while a card at each of its ends is in view, some of it clear of the
 * frame's fade (`linesInView`), so no line leads from a card out of view into an empty field. The browser check is in
 * tests/round19-p2-layout.test.ts; this is the rule alone.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TopicHandle } from "../src/core/contracts/course-map.ts";
import { linesInView, type CanvasLine, type DrawingBox } from "../components/course-map/topic-map/canvas/canvas-lines.tsx";

const h = (handle: string) => handle as TopicHandle;
const line = (from: string, to: string, cards?: readonly [string, string]): CanvasLine => ({ key: `${from}>${to}`, points: [[0, 0], [0, 1]], prerequisite: h(from), topic: h(to), cards });
const CARDS: Record<string, DrawingBox> = {
	above: { x: 0, y: -200, width: 100, height: 60 },
	edge: { x: 0, y: -30, width: 100, height: 60 },
	here: { x: 0, y: 100, width: 100, height: 60 },
	below: { x: 0, y: 400, width: 100, height: 60 },
	"trail:here": { x: 0, y: 100, width: 100, height: 60 },
};
const cardOf = (id: string) => CARDS[id] ?? null;
const CLEAR: DrawingBox = { x: 0, y: 0, width: 300, height: 300 };

describe("A map's lines in view (round 19, m13 a)", () => {
	it("keeps a line whose two cards show, even one cut at the frame's clear edge", () => {
		assert.deepEqual(
			linesInView([line("edge", "here")], cardOf, CLEAR).map((l) => l.key),
			["edge>here"],
		);
	});

	it("drops a line with a card out of view at either end", () => {
		assert.deepEqual(linesInView([line("above", "here"), line("here", "below"), line("above", "below")], cardOf, CLEAR), []);
	});

	it("drops a line whose card is not drawn", () => {
		assert.deepEqual(linesInView([line("gone", "here")], cardOf, CLEAR), []);
	});

	it("finds a trail's cards by their own ids", () => {
		assert.deepEqual(linesInView([line("here", "edge", ["trail:here", "trail:edge"])], cardOf, CLEAR), []);
		assert.equal(linesInView([line("here", "here", ["trail:here", "trail:here"])], cardOf, CLEAR).length, 1);
	});

	it("draws every line before the frame is measured (a server render)", () => {
		const lines = [line("above", "below")];
		assert.ok(linesInView(lines, cardOf, null) === lines, "the same lines, untouched");
	});
});
