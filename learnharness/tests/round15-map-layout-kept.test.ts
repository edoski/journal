/**
 * Round 15, P7 (app speed): each visit to Home drew every course's map
 * afresh, and the layered layout's solver was most of the visit (about
 * 0.3 s of script at his courses' size). A layout is now made once for its
 * cards, needs and card size, and every later drawing of them takes it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutCanvas } from "../components/course-map/topic-map/canvas/canvas-layout.ts";
import type { CourseMapEdge, TopicHandle } from "../src/core/index.ts";

const cards = (...handles: string[]) => handles.map((h) => ({ handle: h as TopicHandle }));
const need = (prerequisite: string, topic: string) => ({ kind: "needs", prerequisite, topic }) as unknown as CourseMapEdge;

describe("a map's layout is made once (round 15, P7)", () => {
	it("a second drawing of the same cards and needs takes the first's layout, read from fresh copies", () => {
		const first = layoutCanvas(cards("a", "b", "c"), [need("a", "b"), need("b", "c")], new Set(["a" as TopicHandle]));
		const again = layoutCanvas(cards("a", "b", "c"), [need("a", "b"), need("b", "c")], new Set(["a" as TopicHandle]));
		assert.ok(first === again, "the same layout, not one made again");
	});

	it("other cards, needs, held topics or card sizes make their own", () => {
		const base = layoutCanvas(cards("a", "b", "c"), [need("a", "b"), need("b", "c")]);
		assert.ok(base !== layoutCanvas(cards("a", "b", "c", "d"), [need("a", "b"), need("b", "c")]));
		assert.ok(base !== layoutCanvas(cards("a", "b", "c"), [need("a", "c"), need("b", "c")]));
		assert.ok(base !== layoutCanvas(cards("a", "b", "c"), [need("a", "b"), need("b", "c")], new Set(["b" as TopicHandle])));
		assert.ok(base !== layoutCanvas(cards("a", "b", "c"), [need("a", "b"), need("b", "c")], new Set(), { width: 100, height: 40 }));
		assert.deepEqual(layoutCanvas(cards("a", "b", "c"), [need("a", "b"), need("b", "c")], new Set(), { width: 100, height: 40 }).node, { width: 100, height: 40 });
	});
});
