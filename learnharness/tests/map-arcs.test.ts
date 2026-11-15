/**
 * The course map's arc candidates (topic-map/arcs/arcs.md): regions and
 * overview lay each arc out alone inside its region (or fold it to a card)
 * and join arcs by one line between their ports; bands stack the arcs as
 * chapters in study order. Every one keeps prerequisites above what needs
 * them, and a grouped style draws the whole course, never one arc alone.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArcHandle, CourseMap, CourseMapArc, CourseMapEdge, CourseMapTopic, TopicHandle } from "../src/core/index.ts";
import { layoutArcRegions } from "../components/course-map/topic-map/arcs/arc-layout.ts";
import { layoutBands } from "../components/course-map/topic-map/bands/bands-layout.ts";
import { drawingOf } from "../components/course-map/topic-map/map-skin.ts";
import { TREE_SKIN } from "../components/course-map/topic-map/canvas/canvas-skin.ts";
import { REGIONS_SKIN } from "../components/course-map/topic-map/regions/regions-skin.ts";
import { OVERVIEW_SKIN } from "../components/course-map/topic-map/overview/overview-skin.ts";
import { BANDS_SKIN } from "../components/course-map/topic-map/bands/bands-skin.ts";
import { CANVAS_NODE } from "../components/course-map/topic-map/canvas/canvas-layout.ts";

const h = (handle: string) => handle as TopicHandle;
const a = (handle: string) => handle as ArcHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
function topic(handle: string, arc: string): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], arc: a(arc) };
}
const ARCS: CourseMapArc[] = [
	{ handle: a("vectors"), title: "Vectors and span", state: "ready", entry: [] },
	{ handle: a("maps"), title: "Linear maps and matrices", state: "learning", entry: [] },
	{ handle: a("systems"), title: "Linear systems and rank", state: "learning", entry: [] },
	{ handle: a("eigen"), title: "Diagonalization by change of basis", state: "new", entry: [] },
];
const TOPICS = [
	topic("vec", "vectors"),
	topic("span", "vectors"),
	topic("matmul", "maps"),
	topic("linmap", "maps"),
	topic("elim", "systems"),
	topic("rank", "systems"),
	topic("eig", "eigen"),
	topic("diag", "eigen"),
];
const NEEDS: CourseMapEdge[] = Object.entries({ span: ["vec"], matmul: ["vec"], linmap: ["matmul", "span"], rank: ["elim", "span"], eig: ["rank", "linmap"], diag: ["eig", "span"] }).flatMap(([t, ps]) =>
	ps.map((p) => ({ kind: "needs" as const, prerequisite: h(p), topic: h(t) })),
);
const ALL = new Set(ARCS.map((x) => x.handle));
const arcOf = new Map(TOPICS.map((t) => [t.handle, t.arc!]));

describe("arc regions", () => {
	const { layout, drawing } = layoutArcRegions(TOPICS, NEEDS, { arcs: ARCS, open: ALL, current: a("eigen") });

	it("holds every topic inside its own arc's region, and no two regions overlap", () => {
		for (const [handle, at] of layout.topics) {
			const region = drawing.regions.find((r) => r.arc.handle === arcOf.get(handle))!;
			assert.ok(at.x >= region.x && at.y >= region.y && at.x + CANVAS_NODE.width <= region.x + region.width && at.y + CANVAS_NODE.height <= region.y + region.height, `${handle} inside ${region.arc.handle}`);
		}
		for (const r of drawing.regions)
			for (const s of drawing.regions) {
				if (r === s) continue;
				assert.ok(r.x + r.width <= s.x || s.x + s.width <= r.x || r.y + r.height <= s.y || s.y + s.height <= r.y, `${r.arc.handle} and ${s.arc.handle} apart`);
			}
	});

	it("draws a need between arcs as one line from the earlier arc's bottom centre to the later arc's top centre", () => {
		const across = layout.routes.filter((r) => arcOf.get(r.prerequisite) !== arcOf.get(r.topic));
		assert.ok(across.length > 0 && across.every((r) => r.points.length === 0));
		for (const link of drawing.links) {
			const from = drawing.regions.find((r) => r.arc.handle === link.from)!;
			const to = drawing.regions.find((r) => r.arc.handle === link.to)!;
			assert.deepEqual(link.points[0], [from.x + from.width / 2, from.y + from.height]);
			assert.deepEqual(link.points.at(-1), [to.x + to.width / 2, to.y]);
		}
	});

	it("puts arcs side by side in study order, and numbers them in it", () => {
		assert.deepEqual(
			drawing.regions.map((r) => r.number),
			[1, 2, 3, 4],
		);
		const maps = drawing.regions.find((r) => r.arc.handle === "maps")!;
		const systems = drawing.regions.find((r) => r.arc.handle === "systems")!;
		if (maps.y === systems.y) assert.ok(maps.x < systems.x);
	});

	it("folds an arc to one card, leaving its topics off the drawing", () => {
		const folded = layoutArcRegions(TOPICS, NEEDS, { arcs: ARCS, open: new Set([a("eigen")]), current: a("eigen") });
		assert.deepEqual([...folded.layout.topics.keys()].sort(), ["diag", "eig"]);
		assert.equal(folded.drawing.regions.filter((r) => r.open).length, 1);
		assert.ok(folded.layout.routes.every((r) => folded.layout.topics.has(r.prerequisite) && folded.layout.topics.has(r.topic)));
	});
});

describe("arc bands", () => {
	const drawn = layoutBands(TOPICS, NEEDS, { arcs: ARCS, open: ALL, current: a("eigen") })!;

	it("stacks the arcs top to bottom in study order, every topic in its own arc's band", () => {
		drawn.bands.forEach((band, i) => {
			if (i > 0) assert.ok(band.top >= drawn.bands[i - 1]!.bottom - 0.5, `${band.arc.handle} below the one before`);
			for (const t of band.topics) {
				const at = drawn.layout.topics.get(t)!;
				assert.ok(at.y >= band.top && at.y + CANVAS_NODE.height <= band.bottom, `${t} inside ${band.arc.handle}`);
			}
		});
	});

	it("keeps every card right of the margin, where the arcs are named", () => {
		for (const at of drawn.layout.topics.values()) assert.ok(at.x >= drawn.margin);
	});

	it("draws no band when a need runs from a later arc to an earlier one", () => {
		const back: CourseMapEdge[] = [...NEEDS, { kind: "needs", prerequisite: h("rank"), topic: h("matmul") }];
		assert.equal(layoutBands(TOPICS, back, { arcs: ARCS, open: ALL, current: null }), null);
	});
});

describe("what a map draws", () => {
	const map: CourseMap = { workspace: "/c", title: "Linear Algebra", topics: TOPICS, edges: NEEDS, current: h("eig"), arcs: ARCS } as unknown as CourseMap;

	it("draws one arc for Canvas tree, and the whole course for every arc style", () => {
		assert.equal(drawingOf(TREE_SKIN, map, a("maps")).layout.topics.size, 2);
		assert.equal(drawingOf(REGIONS_SKIN, map, a("maps")).layout.topics.size, TOPICS.length);
		assert.equal(drawingOf(BANDS_SKIN, map, a("maps")).layout.topics.size, TOPICS.length);
	});

	it("opens the arc he is in and the arc a page shows on the overview, and frames the one shown", () => {
		const shown = drawingOf(OVERVIEW_SKIN, map, a("maps"));
		assert.deepEqual([...shown.layout.topics.keys()].sort(), ["diag", "eig", "linmap", "matmul"]);
		assert.equal(shown.framedArc, "maps");
		assert.equal(drawingOf(OVERVIEW_SKIN, map, undefined).framedArc, null);
	});
});
