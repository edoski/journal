/** Where a lesson sits in its course (src/core/lesson-place.ts): the topic
 *  and arc the top bar's roadmap links up to. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lessonPlaceOf } from "../src/core/lesson-place.ts";
import type { CourseMap } from "../src/core/index.ts";

const map = {
	current: null,
	topics: [
		{ handle: "kernel", title: "Kernel and rank-nullity", arc: "spaces" },
		{ handle: "eigen", title: "Eigenvalues and eigenvectors", arc: "spectra" },
	],
	arcs: [
		{ handle: "spaces", title: "Spaces", state: "learning", entry: [] },
		{ handle: "spectra", title: "Spectra", state: "new", entry: [] },
	],
} as unknown as CourseMap;

describe("lessonPlaceOf", () => {
	it("takes the first candidate topic the map lists, with that topic's arc", () => {
		assert.deepEqual(lessonPlaceOf(map, ["not-listed", "eigen", "kernel"]), { topic: { handle: "eigen", title: "Eigenvalues and eigenvectors" }, arc: { title: "Spectra" } });
	});

	it("names no arc in a course without arcs, and nothing for a lesson with no listed topic", () => {
		const plain = { ...map, arcs: undefined, topics: map.topics.map(({ arc: _arc, ...t }) => t) } as unknown as CourseMap;
		assert.deepEqual(lessonPlaceOf(plain, ["kernel"]), { topic: { handle: "kernel", title: "Kernel and rank-nullity" }, arc: null });
		assert.deepEqual(lessonPlaceOf(map, ["nope"]), { topic: null, arc: null });
		assert.deepEqual(lessonPlaceOf(map, undefined), { topic: null, arc: null });
	});
});
