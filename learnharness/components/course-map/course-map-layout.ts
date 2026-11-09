/**
 * The course map's geometry: a layered top-to-bottom drawing of the
 * `needs` edges (Sugiyama, d3-dag), prerequisites above the topics that
 * need them. `contrasts` stays out of the layout and is drawn over it.
 * Pure: the same map gives the same drawing.
 */

import { coordSimplex, decrossOpt, decrossTwoLayer, graphStratify, layeringSimplex, sugiyama } from "d3-dag";
import type { CourseMapEdge, CourseMapTopic, TopicHandle } from "@/src/core";

export const NODE_WIDTH = 192;
export const NODE_HEIGHT = 64;
/** Horizontal space between nodes in a layer, and vertical between layers. */
export const NODE_GAP = 24;
export const LAYER_GAP = 56;
/** Optimal decrossing up to this many topics, the two-layer heuristic above
 *  (d3-dag: optimal decrossing is for small graphs only). */
export const OPTIMAL_DECROSS_LIMIT = 25;

export type Point = readonly [number, number];

export interface PlacedTopic {
	handle: TopicHandle;
	/** The node's top-left corner. */
	x: number;
	y: number;
	layer: number;
}

export interface PlacedNeed {
	prerequisite: TopicHandle;
	topic: TopicHandle;
	/** From the prerequisite's bottom edge to the topic's top edge, through
	 *  the layout's bend points. */
	points: readonly Point[];
}

export interface CourseMapLayout {
	width: number;
	height: number;
	topics: ReadonlyMap<TopicHandle, PlacedTopic>;
	needs: readonly PlacedNeed[];
	/** Handles per layer, left to right. */
	layers: readonly (readonly TopicHandle[])[];
}

interface Datum {
	id: string;
	parentIds: string[];
}

/** One column in the given order: a course with no `needs` at all. */
function column(topics: readonly CourseMapTopic[]): CourseMapLayout {
	const placed = new Map<TopicHandle, PlacedTopic>();
	topics.forEach((topic, index) => placed.set(topic.handle, { handle: topic.handle, x: 0, y: index * (NODE_HEIGHT + NODE_GAP), layer: index }));
	return {
		width: topics.length ? NODE_WIDTH : 0,
		height: topics.length ? topics.length * NODE_HEIGHT + (topics.length - 1) * NODE_GAP : 0,
		topics: placed,
		needs: [],
		layers: topics.map((t) => [t.handle]),
	};
}

export function layoutCourseMap(topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[]): CourseMapLayout {
	const needs = edges.filter((e): e is Extract<CourseMapEdge, { kind: "needs" }> => e.kind === "needs");
	if (needs.length === 0) return column(topics);
	const parents = new Map<string, string[]>(topics.map((t) => [t.handle, []]));
	for (const edge of needs) parents.get(edge.topic)?.push(edge.prerequisite);
	const data: Datum[] = topics.map((t) => ({ id: t.handle, parentIds: parents.get(t.handle) ?? [] }));
	const dag = graphStratify()(data);
	const layout = sugiyama()
		.nodeSize([NODE_WIDTH, NODE_HEIGHT])
		.gap([NODE_GAP, LAYER_GAP])
		.layering(layeringSimplex())
		.decross(topics.length <= OPTIMAL_DECROSS_LIMIT ? decrossOpt() : decrossTwoLayer())
		.coord(coordSimplex());
	const { width, height } = layout(dag);

	const placed = new Map<TopicHandle, PlacedTopic>();
	const layerOf = new Map<number, TopicHandle[]>();
	const layerYs = [...new Set([...dag.nodes()].map((n) => n.y))].sort((a, b) => a - b);
	for (const node of dag.nodes()) {
		const handle = node.data.id as TopicHandle;
		const layer = layerYs.indexOf(node.y);
		placed.set(handle, { handle, x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2, layer });
		layerOf.set(layer, [...(layerOf.get(layer) ?? []), handle]);
	}
	const layers = layerYs.map((_, index) =>
		(layerOf.get(index) ?? []).sort((a, b) => placed.get(a)!.x - placed.get(b)!.x),
	);
	const placedNeeds: PlacedNeed[] = [];
	for (const link of dag.links()) {
		const points = link.points.map(([x, y]) => [x, y] as const);
		if (points.length < 2) continue;
		const first = points[0]!;
		const last = points[points.length - 1]!;
		points[0] = [first[0], first[1] + NODE_HEIGHT / 2];
		points[points.length - 1] = [last[0], last[1] - NODE_HEIGHT / 2];
		placedNeeds.push({ prerequisite: link.source.data.id as TopicHandle, topic: link.target.data.id as TopicHandle, points });
	}
	return { width, height, topics: placed, needs: placedNeeds, layers };
}

/** Every prerequisite of `handle`, transitively (not `handle` itself). */
export function prerequisitesOf(handle: TopicHandle, edges: readonly CourseMapEdge[]): Set<TopicHandle> {
	const found = new Set<TopicHandle>();
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

/** The topics that compete with `handle` as methods. */
export function contrastsOf(handle: TopicHandle, edges: readonly CourseMapEdge[]): TopicHandle[] {
	return edges.flatMap((edge) =>
		edge.kind === "contrasts" && edge.pair.includes(handle) ? [edge.pair[0] === handle ? edge.pair[1] : edge.pair[0]] : [],
	);
}
