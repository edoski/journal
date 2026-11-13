/**
 * The topic map's geometry (spec: topic-map.md): a layered top-to-bottom
 * drawing of the `needs` edges (Sugiyama, d3-dag), prerequisites above the
 * topics that need them, each need routed so it never runs through a
 * topic. Pure: the same course gives the same drawing.
 */

import { coordSimplex, decrossOpt, decrossTwoLayer, graphStratify, layeringSimplex, sugiyama } from "d3-dag";
import type { CourseMapEdge, CourseMapTopic, TopicHandle } from "@/src/core";

export const NODE_WIDTH = 224;
export const NODE_HEIGHT = 64;
/** Space between topics in a layer, and between layers. */
export const NODE_GAP = 24;
export const LAYER_GAP = 56;
/** Optimal decrossing up to this many topics, the two-layer heuristic above
 *  (d3-dag: optimal decrossing is for small graphs only). */
const OPTIMAL_DECROSS_LIMIT = 25;

export type Point = readonly [number, number];

export interface PlacedTopic {
	handle: TopicHandle;
	/** The node's top-left corner. */
	x: number;
	y: number;
	layer: number;
}

export interface Route {
	prerequisite: TopicHandle;
	topic: TopicHandle;
	/** From the prerequisite's bottom edge to the topic's top edge. A need
	 *  that skips a layer passes it straight down, between that layer's
	 *  topics: two points per layer passed, its top and its bottom. */
	points: readonly Point[];
}

export interface TopicMapLayout {
	width: number;
	height: number;
	topics: ReadonlyMap<TopicHandle, PlacedTopic>;
	routes: readonly Route[];
	/** Handles per layer, left to right. */
	layers: readonly (readonly TopicHandle[])[];
}

type Need = Extract<CourseMapEdge, { kind: "needs" }>;

/** One column in the given order: a course with no `needs` at all. */
function column(topics: readonly CourseMapTopic[]): TopicMapLayout {
	const placed = new Map<TopicHandle, PlacedTopic>();
	topics.forEach((topic, index) => placed.set(topic.handle, { handle: topic.handle, x: 0, y: index * (NODE_HEIGHT + NODE_GAP), layer: index }));
	return {
		width: topics.length ? NODE_WIDTH : 0,
		height: topics.length ? topics.length * NODE_HEIGHT + (topics.length - 1) * NODE_GAP : 0,
		topics: placed,
		routes: [],
		layers: topics.map((t) => [t.handle]),
	};
}

export function layoutTopicMap(topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[]): TopicMapLayout {
	const needs = edges.filter((e): e is Need => e.kind === "needs");
	if (needs.length === 0) return column(topics);
	const parents = new Map<string, string[]>(topics.map((t) => [t.handle, []]));
	for (const edge of needs) parents.get(edge.topic)?.push(edge.prerequisite);
	const dag = graphStratify()(topics.map((t) => ({ id: t.handle as string, parentIds: parents.get(t.handle) ?? [] })));
	const { width, height } = sugiyama()
		.nodeSize([NODE_WIDTH, NODE_HEIGHT])
		.gap([NODE_GAP, LAYER_GAP])
		.layering(layeringSimplex())
		.decross(topics.length <= OPTIMAL_DECROSS_LIMIT ? decrossOpt() : decrossTwoLayer())
		.coord(coordSimplex())(dag);

	const placed = new Map<TopicHandle, PlacedTopic>();
	const layerYs = [...new Set([...dag.nodes()].map((n) => n.y))].sort((a, b) => a - b);
	const layers: TopicHandle[][] = layerYs.map(() => []);
	for (const node of dag.nodes()) {
		const handle = node.data.id as TopicHandle;
		const layer = layerYs.indexOf(node.y);
		placed.set(handle, { handle, x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2, layer });
		layers[layer]!.push(handle);
	}
	for (const layer of layers) layer.sort((a, b) => placed.get(a)!.x - placed.get(b)!.x);

	const half = NODE_HEIGHT / 2;
	const routes: Route[] = [];
	for (const link of dag.links()) {
		const centres = link.points;
		if (centres.length < 2) continue;
		const [first, last] = [centres[0]!, centres[centres.length - 1]!];
		const passed = centres.slice(1, -1).flatMap(([x, y]): Point[] => [
			[x, y - half],
			[x, y + half],
		]);
		routes.push({
			prerequisite: link.source.data.id as TopicHandle,
			topic: link.target.data.id as TopicHandle,
			points: [[first[0], first[1] + half], ...passed, [last[0], last[1] - half]],
		});
	}
	return { width, height, topics: placed, routes, layers };
}

/**
 * A route as an SVG path: between layers one smooth S-curve that leaves and
 * arrives vertically, and straight down past a layer it skips. Pure.
 */
export function routePath(points: readonly Point[]): string {
	const [start, ...rest] = points;
	if (!start) return "";
	let d = `M${start[0]},${start[1]}`;
	let from = start;
	rest.forEach((to, index) => {
		// The first step and every second one after it cross a layer gap; the others run down past a skipped layer.
		if (index % 2 === 0) {
			const mid = (from[1] + to[1]) / 2;
			d += ` C${from[0]},${mid} ${to[0]},${mid} ${to[0]},${to[1]}`;
		} else {
			d += ` L${to[0]},${to[1]}`;
		}
		from = to;
	});
	return d;
}

/** A topic with every prerequisite it has, transitively. */
export function chainOf(handle: TopicHandle, edges: readonly CourseMapEdge[]): Set<TopicHandle> {
	const found = new Set<TopicHandle>([handle]);
	const stack = [handle];
	while (stack.length) {
		const next = stack.pop()!;
		for (const edge of edges) {
			if (edge.kind === "needs" && edge.topic === next && !found.has(edge.prerequisite)) {
				found.add(edge.prerequisite);
				stack.push(edge.prerequisite);
			}
		}
	}
	return found;
}

export type WalkKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export function isWalkKey(key: string): key is WalkKey {
	return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

/**
 * Where an arrow key goes from a topic: Up to its nearest prerequisite,
 * Down to the nearest topic that needs it, Left and Right along its layer;
 * null at the map's edge. Pure.
 */
export function neighbourOf(layout: TopicMapLayout, edges: readonly CourseMapEdge[], handle: TopicHandle, key: WalkKey): TopicHandle | null {
	const here = layout.topics.get(handle);
	if (!here) return null;
	if (key === "ArrowLeft" || key === "ArrowRight") {
		const row = layout.layers[here.layer] ?? [];
		return row[row.indexOf(handle) + (key === "ArrowLeft" ? -1 : 1)] ?? null;
	}
	const linked = edges.flatMap((e) => {
		if (e.kind !== "needs") return [];
		if (key === "ArrowUp") return e.topic === handle ? [e.prerequisite] : [];
		return e.prerequisite === handle ? [e.topic] : [];
	});
	const off = (other: TopicHandle) => Math.abs((layout.topics.get(other)?.x ?? Infinity) - here.x);
	return linked.sort((a, b) => off(a) - off(b))[0] ?? null;
}

export interface Camera {
	x: number;
	y: number;
	zoom: number;
}

/** The whole course shows when it fits the frame at this scale or more:
 *  below it the titles drop under 10px. */
export const WHOLE_COURSE_ZOOM = 0.75;
/** The furthest the map zooms out by hand. */
export const MIN_ZOOM = 0.4;

/** The scale at which the whole drawing, with `room` around it, fits a frame. */
export function wholeZoom(layout: TopicMapLayout, frame: { width: number; height: number }, room: { x: number; y: number }): number {
	if (layout.width === 0 || layout.height === 0) return 1;
	return Math.min(1, frame.width / (layout.width + room.x * 2), frame.height / (layout.height + room.y * 2));
}

type Frame = { width: number; height: number };
type Room = { x: number; y: number };

/** One axis of the camera: `at` at the frame's middle, pulled back so the
 *  frame never looks past the drawing and its room; a drawing shorter than
 *  the frame sits at its middle. */
function along(at: number, size: number, frame: number, room: number, zoom: number): number {
	if ((size + room * 2) * zoom <= frame) return (frame - size * zoom) / 2;
	return Math.min(room * zoom, Math.max(frame - (size + room) * zoom, frame / 2 - at * zoom));
}

/** The camera that brings a point of the drawing as near the frame's
 *  centre as the drawing's edges allow. Pure. */
export function cameraAt(layout: TopicMapLayout, point: Point, zoom: number, frame: Frame, room: Room): Camera {
	return { x: along(point[0], layout.width, frame.width, room.x, zoom), y: along(point[1], layout.height, frame.height, room.y, zoom), zoom };
}

/** A topic's centre. */
export function centreOf(placed: PlacedTopic): Point {
	return [placed.x + NODE_WIDTH / 2, placed.y + NODE_HEIGHT / 2];
}

/**
 * Where the map opens: the whole course in the frame when it fits at 75%
 * or more, else full size on the current topic (the first topic when the
 * course has no current one). Pure.
 */
export function openingCamera(layout: TopicMapLayout, current: TopicHandle | null, frame: Frame, room: Room): Camera {
	const zoom = wholeZoom(layout, frame, room);
	const middle: Point = [layout.width / 2, layout.height / 2];
	if (zoom >= WHOLE_COURSE_ZOOM) return cameraAt(layout, middle, zoom, frame, room);
	const at = (current && layout.topics.get(current)) ?? layout.topics.get(layout.layers[0]?.[0] as TopicHandle);
	return cameraAt(layout, at ? centreOf(at) : middle, 1, frame, room);
}
