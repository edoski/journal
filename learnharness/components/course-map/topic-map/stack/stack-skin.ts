import type { MapSkin, Trail } from "../map-skin";
import { TREE_SKIN, canvasEdges } from "../canvas/canvas-skin";
import type { CanvasLine } from "../canvas/canvas-lines";
import { TrailNode } from "./trail-node";

/** A trail's lines, placed beside the shown arc as its cards are. Pure. */
export function trailLines(trail: Trail): CanvasLine[] {
	return trail.layout.routes.map((r) => ({
		key: `trail:${r.prerequisite}>${r.topic}`,
		points: r.points.map(([x, y]) => [x + trail.dx, y + trail.dy] as const),
		prerequisite: r.prerequisite,
		topic: r.topic,
	}));
}

/** The `stack` option (stack.md): each arc exactly as Canvas tree draws it, one at a time, the camera gliding up or
 *  down to the arc above or below. */
export const STACK_SKIN: MapSkin = {
	...TREE_SKIN,
	nodeTypes: { ...TREE_SKIN.nodeTypes, trailTopic: TrailNode },
	edges: (_map, layout, trail) => canvasEdges(layout, trail ? trailLines(trail) : []),
	travel: true,
};
