import { Position, type Edge } from "@xyflow/react";
import type { ArcHandle, CourseMap } from "@/src/core";
import { arcView, type ArcView } from "./arc-view";
import type { TopicMapLayout } from "./topic-map-layout";
import { layoutCanvas } from "./canvas/canvas-layout";
import { linesEdge, type CanvasLine } from "./canvas/canvas-lines";

/** Where a handle sits on a node of a given size. */
export function handleAt(position: Position, size: { width: number; height: number }): { x: number; y: number } {
	if (position === Position.Top) return { x: size.width / 2, y: 0 };
	if (position === Position.Bottom) return { x: size.width / 2, y: size.height };
	if (position === Position.Left) return { x: 0, y: size.height / 2 };
	return { x: size.width, y: size.height / 2 };
}

/** The arc a map left, drawn beside the arc it shows while the camera glides over (topic-map.md, Arcs): its own
 *  drawing, placed `dx`, `dy` from the shown arc's. */
export interface Trail {
	arc: ArcHandle;
	view: ArcView;
	layout: TopicMapLayout;
	dx: number;
	dy: number;
}

/** Room between two arcs stacked one over the other, so the camera's glide reads as one arc leaving and the next
 *  arriving. */
export const ARC_GAP = 160;

/** What a map draws for a page: one arc of the course (`arcView`), or the whole course when it has no arcs or the
 *  page shows them all, laid out as the canvas draws it (canvas/canvas.md). Pure. */
export function drawingOf(course: CourseMap, arc: ArcHandle | undefined): { view: ArcView; layout: TopicMapLayout } {
	const view = arcView(course, arc);
	return { view, layout: layoutCanvas(view.map.topics, view.map.edges, new Set(view.entry.keys())) };
}

/** The arc `from` drawn beside `to`'s drawing (`shown`), as the arcs stack in study order: above it when it comes
 *  first, below when it comes after, both on one vertical axis, `ARC_GAP` apart. Null when either is not one of the
 *  course's arcs. Pure. */
export function trailOf(course: CourseMap, from: ArcHandle, to: ArcHandle, shown: TopicMapLayout): Trail | null {
	const arcs = course.arcs ?? [];
	const a = arcs.findIndex((arc) => arc.handle === from);
	const b = arcs.findIndex((arc) => arc.handle === to);
	if (a < 0 || b < 0 || a === b) return null;
	const { view, layout } = drawingOf(course, from);
	return { arc: from, view, layout, dx: (shown.width - layout.width) / 2, dy: a < b ? -(layout.height + ARC_GAP) : shown.height + ARC_GAP };
}

/** The lines of a drawing's needs: each need it draws (none for a need its chain implies, canvas.md, Implied needs), with a
 *  `trail`'s lines placed beside it as its cards are, as the one edge that draws them all (`CanvasLinesEdge`). Pure. */
export function mapEdges(layout: TopicMapLayout, trail: Trail | null = null): Edge[] {
	const needs = layout.routes.map((r): CanvasLine => ({ key: `${r.prerequisite}>${r.topic}`, points: r.points, prerequisite: r.prerequisite, topic: r.topic }));
	const trailed = trail
		? trail.layout.routes.map((r): CanvasLine => ({ key: `trail:${r.prerequisite}>${r.topic}`, points: r.points.map(([x, y]) => [x + trail.dx, y + trail.dy] as const), prerequisite: r.prerequisite, topic: r.topic }))
		: [];
	const first = layout.routes.find((route) => route.points.length > 0);
	return linesEdge([...needs, ...trailed], first ? { source: first.prerequisite, target: first.topic } : null);
}
