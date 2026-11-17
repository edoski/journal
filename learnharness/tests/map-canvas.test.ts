/**
 * The map's canvas (canvas.md): the course top to bottom, each need out of its
 * prerequisite's bottom centre on that prerequisite's bracket and into its
 * topic's top centre; implied needs left to their chain;
 * the focus that lights what a topic needs and leads to; and arrows that
 * walk it as they walk the map.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseMapEdge, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { neighbourOf, type Point } from "../components/course-map/topic-map/topic-map-layout.ts";
import { CANVAS_NODE, layoutCanvas, orthogonalPath, transitiveReduction } from "../components/course-map/topic-map/canvas/canvas-layout.ts";
import { focusOf } from "../components/course-map/topic-map/canvas/canvas-focus.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
function topic(handle: string): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [] };
}
function needsOf(needs: Record<string, string[]>): CourseMapEdge[] {
	return Object.entries(needs).flatMap(([t, prereqs]) => prereqs.map((p) => ({ kind: "needs" as const, prerequisite: h(p), topic: h(t) })));
}

const TOPICS = ["vectors", "span", "matmul", "basis", "det", "eigen"].map(topic);
const NEEDS = needsOf({ span: ["vectors"], matmul: ["vectors"], basis: ["span"], det: ["matmul"], eigen: ["basis", "det", "vectors"] });
const layout = layoutCanvas(TOPICS, NEEDS);
const drawnRoutes = (routes: typeof layout.routes) => routes.filter((r) => r.points.length > 0);
const { width: W, height: H } = CANVAS_NODE;

describe("the canvas's drawing", () => {
	it("puts every prerequisite above the topics that need it", () => {
		for (const need of NEEDS.filter((e) => e.kind === "needs")) {
			assert.ok(layout.topics.get(need.prerequisite)!.y + H < layout.topics.get(need.topic)!.y, `${need.prerequisite} above ${need.topic}`);
		}
	});

	it("runs each need out of the prerequisite's bottom centre and into the topic's top centre, at right angles", () => {
		for (const { prerequisite, topic: to, points } of drawnRoutes(layout.routes)) {
			const from = layout.topics.get(prerequisite)!;
			const into = layout.topics.get(to)!;
			assert.deepEqual(points[0], [from.x + W / 2, from.y + H]);
			assert.deepEqual(points.at(-1), [into.x + W / 2, into.y]);
			points.slice(1).forEach((p, i) => assert.ok(p[0] === points[i]![0] || p[1] === points[i]![1], `${prerequisite}>${to} turns at right angles`));
			points.slice(1).forEach((p, i) => assert.ok(p[1] >= points[i]![1], `${prerequisite}>${to} never runs up`));
		}
	});

	it("gives different prerequisites' brackets lanes of their own, unless they only meet where both drop into one card", () => {
		const across = layout.routes.flatMap((r) =>
			r.points.slice(1).flatMap((p, i): { from: TopicHandle; to: TopicHandle; y: number; low: number; high: number }[] => {
				const q: Point = r.points[i]!;
				return p[1] === q[1] && p[0] !== q[0] ? [{ from: r.prerequisite, to: r.topic, y: p[1], low: Math.min(p[0], q[0]), high: Math.max(p[0], q[0]) }] : [];
			}),
		);
		for (const a of across) for (const b of across) {
			if (a.from === b.from || a.y !== b.y) continue;
			const meet = a.to === b.to && (a.high === b.low || b.high === a.low);
			assert.ok(meet || a.high + 24 <= b.low || b.high + 24 <= a.low, `${a.from} and ${b.from} share no lane`);
		}
	});

	it("keeps parallel lines of different needs at least 24 apart", () => {
		const segments = layout.routes.flatMap((r) => r.points.slice(1).map((p, i) => ({ r, a: r.points[i]!, b: p })));
		for (const s of segments) for (const t of segments) {
			if (s.r === t.r) continue;
			const vertical = (q: typeof s) => q.a[0] === q.b[0];
			if (vertical(s) !== vertical(t)) continue;
			const k = vertical(s) ? 1 : 0;
			const shared = Math.min(Math.max(s.a[k], s.b[k]), Math.max(t.a[k], t.b[k])) - Math.max(Math.min(s.a[k], s.b[k]), Math.min(t.a[k], t.b[k]));
			const gap = Math.abs(s.a[1 - k]! - t.a[1 - k]!);
			if (shared > 8 && gap > 0.5) assert.ok(gap >= 24, `${s.r.prerequisite}>${s.r.topic} runs ${gap}px from ${t.r.prerequisite}>${t.r.topic}`);
		}
	});

	it("leaves no step too short for two full corners, and runs past every card it skips", () => {
		const wide = needsOf({ span: ["vectors"], matmul: ["vectors"], basis: ["span"], det: ["matmul"], eigen: ["basis", "det", "vectors", "span"] });
		const drawn = layoutCanvas(TOPICS, wide);
		for (const { prerequisite, topic: to, points } of drawnRoutes(drawn.routes)) {
			points.slice(1).forEach((p, i) => {
				const q = points[i]!;
				if (p[1] === q[1]) assert.ok(Math.abs(p[0] - q[0]) >= 16, `${prerequisite}>${to} steps ${Math.abs(p[0] - q[0])}px`);
				if (p[0] !== q[0]) return;
				for (const [handle, at] of drawn.topics) {
					if (handle === prerequisite || handle === to) continue;
					const overlaps = Math.min(p[1], q[1]) < at.y + H && Math.max(p[1], q[1]) > at.y;
					assert.ok(!overlaps || p[0] <= at.x || p[0] >= at.x + W, `${prerequisite}>${to} runs through ${handle}`);
				}
			});
		}
	});

	it("draws a line at right angles, with rounded corners", () => {
		const d = orthogonalPath([
			[0, 0],
			[0, 30],
			[100, 30],
			[100, 60],
		]);
		assert.match(d, /^M0,0 L0,22 Q0,30 8,30 L92,30 Q100,30 100,38 L100,60$/);
	});
});

describe("the canvas as a tree", () => {
	const tree = layout;

	it("leaves out only the needs a longer chain implies", () => {
		const implied = NEEDS.filter((e) => e.kind === "needs" && !transitiveReduction(NEEDS.filter((n) => n.kind === "needs")).includes(e));
		assert.deepEqual(
			implied.map((e) => e.kind === "needs" && `${e.prerequisite}>${e.topic}`),
			["vectors>eigen"],
		);
		assert.deepEqual(tree.routes.find((r) => r.prerequisite === h("vectors") && r.topic === h("eigen"))?.points, []);
		assert.equal(tree.routes.filter((r) => r.points.length > 0).length, NEEDS.length - 1);
	});

	it("lights an implied need with the chain that implies it, and names it among the topic's needs", () => {
		const focus = focusOf(h("eigen"), NEEDS, tree.routes);
		assert.deepEqual([...focus.needs].sort(), ["basis", "det", "vectors"]);
		assert.deepEqual(focus.leadsTo, []);
		assert.deepEqual([...focus.via].sort(), ["matmul", "span"]);
		assert.ok(focus.lines.has("vectors>span") && focus.lines.has("span>basis") && focus.lines.has("basis>eigen"));
	});
});

describe("the canvas's focus", () => {
	it("lights a topic's own lines to what it needs and what it leads to, and nothing else", () => {
		const focus = focusOf(h("matmul"), NEEDS, layout.routes);
		assert.deepEqual(focus.needs, ["vectors"]);
		assert.deepEqual(focus.leadsTo, ["det"]);
		assert.deepEqual([...focus.lines].sort(), ["matmul>det", "vectors>matmul"]);
		assert.equal(focus.via.size, 0);
	});
});

describe("the canvas's arrows", () => {
	const walk = (from: string, key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => neighbourOf(layout, NEEDS, h(from), key);

	it("follows the needs with Up and Down, and the layer with Left and Right", () => {
		assert.equal(walk("span", "ArrowUp"), "vectors");
		assert.equal(walk("vectors", "ArrowUp"), null);
		const x = (t: string) => layout.topics.get(h(t))!.x;
		const nearest = ["span", "matmul", "eigen"].sort((a, b) => Math.abs(x(a) - x("vectors")) - Math.abs(x(b) - x("vectors")))[0];
		assert.equal(walk("vectors", "ArrowDown"), nearest);
		const row = layout.layers[layout.topics.get(h("span"))!.layer]!;
		assert.equal(walk(row[0]!, "ArrowRight"), row[1]);
		assert.equal(walk(row[0]!, "ArrowLeft"), null);
	});
});
