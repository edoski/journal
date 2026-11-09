import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseMapEdge, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import {
	LAYER_GAP,
	NODE_GAP,
	NODE_HEIGHT,
	NODE_WIDTH,
	contrastsOf,
	layoutCourseMap,
	prerequisitesOf,
	type CourseMapLayout,
} from "../components/course-map/course-map-layout.ts";

const h = (handle: string) => handle as TopicHandle;

function topic(handle: string): CourseMapTopic {
	return {
		handle: h(handle),
		title: handle,
		level: "new",
		introduced: null,
		review: null,
		weak: false,
		signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 },
		tasks: [],
	};
}

function course(needs: Record<string, string[]>, contrasts: [string, string][] = []) {
	const topics = Object.keys(needs).map(topic);
	const edges: CourseMapEdge[] = [
		...Object.entries(needs).flatMap(([t, prereqs]) => prereqs.map((p) => ({ kind: "needs" as const, prerequisite: h(p), topic: h(t) }))),
		...contrasts.map(([a, b]) => ({ kind: "contrasts" as const, pair: [h(a), h(b)] as const })),
	];
	return { topics, edges };
}

const LINEAR_ALGEBRA = course(
	{
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
	},
	[
		["determinant", "rank"],
		["cramer", "elimination"],
	],
);

function assertDrawable(layout: CourseMapLayout, edges: readonly CourseMapEdge[]) {
	for (const edge of edges) {
		if (edge.kind !== "needs") continue;
		const above = layout.topics.get(edge.prerequisite)!;
		const below = layout.topics.get(edge.topic)!;
		assert.ok(above.layer < below.layer, `${edge.prerequisite} sits above ${edge.topic}`);
		assert.ok(below.y - above.y >= NODE_HEIGHT + LAYER_GAP);
	}
	for (const layer of layout.layers) {
		for (let i = 1; i < layer.length; i++) {
			const left = layout.topics.get(layer[i - 1]!)!;
			const right = layout.topics.get(layer[i]!)!;
			assert.ok(right.x - left.x >= NODE_WIDTH + NODE_GAP - 0.5, `${layer[i - 1]} and ${layer[i]} do not overlap`);
		}
	}
	for (const placed of layout.topics.values()) {
		assert.ok(placed.x >= -0.5 && placed.x + NODE_WIDTH <= layout.width + 0.5, "inside the drawing's width");
		assert.ok(placed.y >= -0.5 && placed.y + NODE_HEIGHT <= layout.height + 0.5, "inside the drawing's height");
	}
}

describe("course map layout", () => {
	it("puts every prerequisite above the topics that need it, with no overlaps", () => {
		const layout = layoutCourseMap(LINEAR_ALGEBRA.topics, LINEAR_ALGEBRA.edges);
		assert.equal(layout.topics.size, 16);
		assertDrawable(layout, LINEAR_ALGEBRA.edges);
		assert.deepEqual(layout.layers[0], [h("vectors")]);
	});

	it("draws each need from the prerequisite's bottom edge to the topic's top edge", () => {
		const layout = layoutCourseMap(LINEAR_ALGEBRA.topics, LINEAR_ALGEBRA.edges);
		assert.equal(layout.needs.length, 23);
		for (const need of layout.needs) {
			const from = layout.topics.get(need.prerequisite)!;
			const to = layout.topics.get(need.topic)!;
			assert.deepEqual(need.points[0], [from.x + NODE_WIDTH / 2, from.y + NODE_HEIGHT]);
			assert.deepEqual(need.points.at(-1), [to.x + NODE_WIDTH / 2, to.y]);
		}
	});

	it("gives the same drawing for the same course", () => {
		const a = layoutCourseMap(LINEAR_ALGEBRA.topics, LINEAR_ALGEBRA.edges);
		const b = layoutCourseMap(LINEAR_ALGEBRA.topics, LINEAR_ALGEBRA.edges);
		assert.deepEqual([...a.topics.values()], [...b.topics.values()]);
		assert.deepEqual(a.needs, b.needs);
	});

	it("lays a course with no needs out as one column in path order", () => {
		const { topics } = course({ c: [], a: [], b: [] });
		const layout = layoutCourseMap(topics, []);
		assert.deepEqual(layout.layers, [[h("c")], [h("a")], [h("b")]]);
		assert.equal(layout.width, NODE_WIDTH);
		assert.equal(layout.topics.get(h("b"))!.y, 2 * (NODE_HEIGHT + NODE_GAP));
	});

	it("lays out an 80-topic course without overlaps", () => {
		const needs: Record<string, string[]> = {};
		for (let i = 0; i < 80; i++) {
			needs[`t${i}`] = i === 0 ? [] : [`t${Math.floor((i - 1) / 3)}`, ...(i % 7 === 0 && i > 10 ? [`t${i - 9}`] : [])];
		}
		const big = course(needs);
		const started = performance.now();
		const layout = layoutCourseMap(big.topics, big.edges);
		assert.ok(performance.now() - started < 3000, "fast enough to run on open");
		assertDrawable(layout, big.edges);
	});

	it("finds a topic's whole prerequisite chain and its contrasts", () => {
		assert.deepEqual(
			[...prerequisitesOf(h("kernel"), LINEAR_ALGEBRA.edges)].sort(),
			["basis", "elimination", "independence", "matmul", "rank", "span", "vectors"],
		);
		assert.deepEqual(contrastsOf(h("rank"), LINEAR_ALGEBRA.edges), ["determinant"]);
		assert.deepEqual(contrastsOf(h("elimination"), LINEAR_ALGEBRA.edges), ["cramer"]);
	});
});
