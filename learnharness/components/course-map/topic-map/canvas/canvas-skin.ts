import { Position, type Edge } from "@xyflow/react";
import type { MapSkin } from "../map-skin";
import type { TopicMapLayout } from "../topic-map-layout";
import { neighbourOf } from "../topic-map-layout";
import { layoutCanvas } from "./canvas-layout";
import { CanvasNode } from "./canvas-node";
import { CanvasLinesEdge, linesEdge, type CanvasLine } from "./canvas-lines";
import { CanvasChrome } from "./canvas-chrome";
import { CanvasFrame } from "./canvas-frame";

/** The canvas's lines: each drawn need, none for a need its chain implies (canvas.md, Tree), with any `extra` lines
 *  (between arcs), as the one edge that draws them all (`CanvasLinesEdge`). */
export function canvasEdges(layout: TopicMapLayout, extra: readonly CanvasLine[] = [], extraEnds: { source: string; target: string } | null = null): Edge[] {
	const needs = layout.routes.map((route): CanvasLine => ({ key: `${route.prerequisite}>${route.topic}`, points: route.points, prerequisite: route.prerequisite, topic: route.topic }));
	const first = layout.routes.find((route) => route.points.length > 0);
	return linesEdge([...needs, ...extra], first ? { source: first.prerequisite, target: first.topic } : extraEnds);
}

/** Canvas tree (canvas.md): a diagram canvas top to bottom, drawing only the needs no longer path implies. */
export const TREE_SKIN: MapSkin = {
	layout: layoutCanvas,
	nodeTypes: { canvasTopic: CanvasNode },
	edgeTypes: { canvasLines: CanvasLinesEdge },
	topicType: "canvasTopic",
	edgeType: "canvasLines",
	handles: { source: Position.Bottom, target: Position.Top },
	tagRoom: 20,
	edges: (_map, layout) => canvasEdges(layout),
	neighbour: neighbourOf,
	Frame: CanvasFrame,
	Chrome: CanvasChrome,
	panOnScroll: true,
	fixedWhenFits: true,
	// A pinch reads a card closer, past its own size, even where the whole course fits at 100%.
	maxZoom: 1.5,
};
