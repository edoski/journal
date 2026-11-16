/**
 * The course map styles Edo has not asked to change stay where they are
 * (round 14, third pass: Stacked arcs replaced Tree and neighbours and
 * shared Tree's code). Each style's drawing of the demo courses, the whole
 * course and every arc alone, its places and its lines, is pinned to the
 * drawing it made before that pass, so a change to shared map code that
 * moves any of them fails here.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { drawingOf, type MapSkin } from "../components/course-map/topic-map/map-skin.ts";
import { TREE_SKIN } from "../components/course-map/topic-map/canvas/canvas-skin.ts";
import { REGIONS_SKIN } from "../components/course-map/topic-map/regions/regions-skin.ts";
import { BANDS_SKIN } from "../components/course-map/topic-map/bands/bands-skin.ts";
import { OVERVIEW_SKIN } from "../components/course-map/topic-map/overview/overview-skin.ts";
import { DEMO_ARC_COURSES } from "./fixtures/demo-arcs.ts";

/** One style's drawings of every demo course, whole and arc by arc: places, lines and the nodes and edges it adds. */
function digest(skin: MapSkin): string {
	const drawings = DEMO_ARC_COURSES.flatMap((course) =>
		[undefined, ...(course.arcs ?? []).map((a) => a.handle)].map((arc) => {
			const { layout } = drawingOf(skin, course, arc);
			const edges = skin.edges?.(course, layout) ?? [];
			const decorations = skin.decorations?.(course, layout) ?? [];
			return {
				size: [layout.width, layout.height],
				topics: [...layout.topics.values()].map((t) => [t.handle, t.x, t.y, t.layer]),
				routes: layout.routes.map((r) => [r.prerequisite, r.topic, r.points]),
				edges: edges.map((e) => [e.id, e.source, e.target, JSON.stringify(e.data)]),
				decorations: decorations.map((n) => [n.id, n.type, n.position, n.width, n.height]),
			};
		}),
	);
	return createHash("sha256").update(JSON.stringify(drawings)).digest("hex").slice(0, 16);
}

/** Each style's digest on the second pass's head (4a7cefc3). */
const PINNED: Record<string, string> = {
	tree: "1517418e0cb3d691",
	regions: "cf3ed63614d043d1",
	bands: "d5cbd222ecbafc94",
	overview: "265bfa2cd125424c",
};

describe("the other map styles stay put", () => {
	for (const [name, skin] of Object.entries({ tree: TREE_SKIN, regions: REGIONS_SKIN, bands: BANDS_SKIN, overview: OVERVIEW_SKIN })) {
		it(`${name} draws every demo course and arc as it did`, () => {
			assert.equal(digest(skin), PINNED[name]);
		});
	}
});
