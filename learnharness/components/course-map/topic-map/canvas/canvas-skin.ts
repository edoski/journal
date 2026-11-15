import { Position, type Edge } from "@xyflow/react";
import type { MapSkin } from "../map-skin";
import type { TopicMapLayout } from "../topic-map-layout";
import { neighbourOf } from "../topic-map-layout";
import { layoutCanvas } from "./canvas-layout";
import { CanvasNode } from "./canvas-node";
import { CanvasEdge } from "./canvas-edge";
import { CanvasChrome } from "./canvas-chrome";
import { CanvasFrame } from "./canvas-frame";

/** The canvas's lines: one per drawn need, none for a need its chain implies (canvas.md, Tree). */
export function canvasEdges(layout: TopicMapLayout): Edge[] {
	return layout.routes.flatMap((route): Edge[] =>
		route.points.length === 0
			? []
			: [
					{
						id: `${route.prerequisite}>${route.topic}`,
						source: route.prerequisite,
						target: route.topic,
						type: "canvasNeed",
						data: { points: route.points },
						focusable: false,
						selectable: false,
						domAttributes: { "aria-hidden": true },
					},
				],
	);
}

/** Canvas tree (canvas.md): a diagram canvas top to bottom, drawing only the needs no longer path implies. */
export const TREE_SKIN: MapSkin = {
	layout: layoutCanvas,
	nodeTypes: { canvasTopic: CanvasNode },
	edgeTypes: { canvasNeed: CanvasEdge },
	topicType: "canvasTopic",
	edgeType: "canvasNeed",
	handles: { source: Position.Bottom, target: Position.Top },
	tagRoom: 20,
	edges: (_map, layout) => canvasEdges(layout),
	neighbour: neighbourOf,
	Frame: CanvasFrame,
	Chrome: CanvasChrome,
	panOnScroll: true,
};
