/**
 * The course map draws every demo course where it did (round 14, third
 * pass: Stacked arcs draws each arc as Tree drew it, and shipped as the
 * only map on 17 Nov 2026). Its drawing of the demo courses, the whole
 * course and every arc alone, its places and its lines, is pinned to the
 * drawing Tree made before that pass, so a change to the map's code that
 * moves any of it fails here.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { drawingOf, mapEdges } from "../components/course-map/topic-map/map-drawing.ts";
import { DEMO_ARC_COURSES } from "./fixtures/demo-arcs.ts";

/** The map's drawings of every demo course, whole and arc by arc: places, lines and the edges it draws them with. */
function digest(): string {
	const drawings = DEMO_ARC_COURSES.flatMap((course) =>
		[undefined, ...(course.arcs ?? []).map((a) => a.handle)].map((arc) => {
			const { layout } = drawingOf(course, arc);
			return {
				size: [layout.width, layout.height],
				topics: [...layout.topics.values()].map((t) => [t.handle, t.x, t.y, t.layer]),
				routes: layout.routes.map((r) => [r.prerequisite, r.topic, r.points]),
				edges: mapEdges(layout).map((e) => [e.id, e.source, e.target, JSON.stringify(e.data)]),
				decorations: [],
			};
		}),
	);
	return createHash("sha256").update(JSON.stringify(drawings)).digest("hex").slice(0, 16);
}

describe("the course map stays put", () => {
	it("draws every demo course and arc as Tree did on the second pass's head (4a7cefc3)", () => {
		assert.equal(digest(), "1517418e0cb3d691");
	});
});
