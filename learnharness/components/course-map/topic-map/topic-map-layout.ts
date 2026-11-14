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

/** One node's box. Every node of a drawing shares it. */
export interface NodeSize {
	width: number;
	height: number;
}

/** The box a lesson's step map draws its steps in (224×64). */
export const NODE_SIZE: NodeSize = { width: NODE_WIDTH, height: NODE_HEIGHT };
/** The topic map's card (spec: topic-map.md, Node): the pie beside a title
 *  and one line under it, wide enough for the longest status. */
export const TOPIC_NODE_SIZE: NodeSize = { width: 248, height: 56 };
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
	/** The box every node is drawn in. */
	node: NodeSize;
	width: number;
	height: number;
	topics: ReadonlyMap<TopicHandle, PlacedTopic>;
	routes: readonly Route[];
	/** Handles per layer, left to right. */
	layers: readonly (readonly TopicHandle[])[];
}

type Need = Extract<CourseMapEdge, { kind: "needs" }>;

/** One column in the given order: a course with no `needs` at all. */
function column(topics: readonly CourseMapTopic[], node: NodeSize): TopicMapLayout {
	const placed = new Map<TopicHandle, PlacedTopic>();
	topics.forEach((topic, index) => placed.set(topic.handle, { handle: topic.handle, x: 0, y: index * (node.height + NODE_GAP), layer: index }));
	return {
		node,
		width: topics.length ? node.width : 0,
		height: topics.length ? topics.length * node.height + (topics.length - 1) * NODE_GAP : 0,
		topics: placed,
		routes: [],
		layers: topics.map((t) => [t.handle]),
	};
}

export function layoutTopicMap(topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[], node: NodeSize = NODE_SIZE): TopicMapLayout {
	const needs = edges.filter((e): e is Need => e.kind === "needs");
	if (needs.length === 0) return column(topics, node);
	const parents = new Map<string, string[]>(topics.map((t) => [t.handle, []]));
	for (const edge of needs) parents.get(edge.topic)?.push(edge.prerequisite);
	const dag = graphStratify()(topics.map((t) => ({ id: t.handle as string, parentIds: parents.get(t.handle) ?? [] })));
	const { width, height } = sugiyama()
		.nodeSize([node.width, node.height])
		.gap([NODE_GAP, LAYER_GAP])
		.layering(layeringSimplex())
		.decross(topics.length <= OPTIMAL_DECROSS_LIMIT ? decrossOpt() : decrossTwoLayer())
		.coord(coordSimplex())(dag);

	const placed = new Map<TopicHandle, PlacedTopic>();
	const layerYs = [...new Set([...dag.nodes()].map((n) => n.y))].sort((a, b) => a - b);
	const layers: TopicHandle[][] = layerYs.map(() => []);
	for (const at of dag.nodes()) {
		const handle = at.data.id as TopicHandle;
		const layer = layerYs.indexOf(at.y);
		placed.set(handle, { handle, x: at.x - node.width / 2, y: at.y - node.height / 2, layer });
		layers[layer]!.push(handle);
	}
	for (const layer of layers) layer.sort((a, b) => placed.get(a)!.x - placed.get(b)!.x);

	const half = node.height / 2;
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
	return { node, width, height, topics: placed, routes, layers };
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

/** The whole lesson shows on a topic page's step map when it fits the
 *  frame at this scale or more: below it its titles drop under 10px. */
export const WHOLE_COURSE_ZOOM = 0.75;
/** The smallest scale a course map opens at: its 13px card titles draw at
 *  10.4px, about the 11px under which a title is too small to read (the
 *  round-3 evaluation, 14 Nov 2026; 75% drew them at 9.75px). Not 85%,
 *  which keeps a full 11px: on Edo's window Linear Algebra cannot open
 *  there without a card cut at the frame's edge, on Home or on its page. */
export const READABLE_ZOOM = 0.8;
/** The furthest the map zooms out by hand. */
export const MIN_ZOOM = 0.4;

/** The scale at which the whole drawing, with `room` around it, fits a
 *  frame. `room` is in the frame's pixels at any scale, as is every room
 *  here: the frame's fade is drawn on the screen, not on the drawing. */
export function wholeZoom(layout: TopicMapLayout, frame: { width: number; height: number }, room: { x: number; y: number }): number {
	if (layout.width === 0 || layout.height === 0) return 1;
	return Math.max(0, Math.min(1, (frame.width - room.x * 2) / layout.width, (frame.height - room.y * 2) / layout.height));
}

type Frame = { width: number; height: number };
type Room = { x: number; y: number };

/** One axis of the camera: `at` at the frame's middle, pulled back so the
 *  frame never looks past the drawing and its room; a drawing shorter than
 *  the frame sits at its middle. */
function along(at: number, size: number, frame: number, room: number, zoom: number): number {
	if (size * zoom + room * 2 <= frame) return (frame - size * zoom) / 2;
	return Math.min(room, Math.max(frame - size * zoom - room, frame / 2 - at * zoom));
}

/** The camera that brings a point of the drawing as near the frame's
 *  centre as the drawing's edges allow. Pure. */
export function cameraAt(layout: TopicMapLayout, point: Point, zoom: number, frame: Frame, room: Room): Camera {
	return { x: along(point[0], layout.width, frame.width, room.x, zoom), y: along(point[1], layout.height, frame.height, room.y, zoom), zoom };
}

/** A topic's centre in a drawing. */
export function centreOf(layout: TopicMapLayout, placed: PlacedTopic): Point {
	return [placed.x + layout.node.width / 2, placed.y + layout.node.height / 2];
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
	return cameraAt(layout, at ? centreOf(layout, at) : middle, 1, frame, room);
}

/** The scales a map may open at when the whole course does not fit: full
 *  size, down to the floor where titles stay readable. */
const FRAMED_ZOOMS = [1, 0.95, 0.9, 0.85, READABLE_ZOOM];
/** What a view is worth, per topic, among those that cut as few cards and
 *  show as many next topics whole (`ViewScore`): one wholly clear of
 *  the fade earns its place, more for a prerequisite of the topic it opens
 *  on, and most for a topic that needs it, where he goes next; one partly
 *  in the fade costs a little. Zooming out costs per step below full size,
 *  and each pixel of empty room shown past the drawing's room costs one. */
const VIEW_WORTH = { whole: 450, before: 250, next: 900, faded: 120, zoom: 3000 };
/** How an opening view ranks, in order: the fewest cards cut at the
 *  frame's edge, none wherever the course allows (Edo, 14 Nov 2026: maps
 *  open with nothing cut); then the most topics he goes next shown whole;
 *  then the lowest `VIEW_WORTH` cost. A cut weighed against whole topics
 *  let three clear neighbours outbid it. */
interface ViewScore {
	cut: number;
	nextWhole: number;
	cost: number;
}
function ranksAbove(a: ViewScore, b: ViewScore): boolean {
	if (a.cut !== b.cut) return a.cut < b.cut;
	if (a.nextWhole !== b.nextWhole) return a.nextWhole > b.nextWhole;
	return a.cost < b.cost;
}
/** The empty room a view may show past the drawing's room on an axis the
 *  course overflows: one topic and its gap, so a topic at the course's
 *  edge can sit clear of the fade with the one beside it wholly out of
 *  view instead of cut. */
export function slackOf(node: NodeSize): { x: number; y: number } {
	return { x: node.width + NODE_GAP, y: node.height + LAYER_GAP };
}

/** How a card sits in a frame whose edges fade `fade` px in: out of view
 *  (wholly past the frame's edge), cut (part of it shows, the frame's edge
 *  cuts the rest off: never acceptable on a map, faded or not), faded
 *  (wholly in the frame, partly under the fade) or clear of the fade.
 *  `slack` px of tolerance on each test: a pixel by default, since cameras
 *  and scrolls are whole pixels. Pure. */
export type CardFit = "out" | "cut" | "faded" | "clear";
export function cardFit(box: { left: number; top: number; right: number; bottom: number }, frame: Frame, fade: Room, slack = 1): CardFit {
	const { left: l, top: t, right: r, bottom: b } = box;
	if (r <= slack || l >= frame.width - slack || b <= slack || t >= frame.height - slack) return "out";
	if (l < -slack || r > frame.width + slack || t < -slack || b > frame.height + slack) return "cut";
	if (l < fade.x - slack || r > frame.width - fade.x + slack || t < fade.y - slack || b > frame.height - fade.y + slack) return "faded";
	return "clear";
}
/** The tolerance an opening view is judged with: half of `cardFit`'s pixel,
 *  so a page that scrolls to it, rounding by up to half a pixel more (the
 *  course page, `scrollOfCamera`), still cuts nothing. */
const OPENING_SLACK = 0.5;

/**
 * Where a map opens (spec: topic-map.md, Behaviour): the whole course
 * when it fits the frame at a readable scale (`READABLE_ZOOM`); else the
 * view that frames `focus` (the first topic when null) clear of the fade,
 * with its tag above it, cutting as few cards as it can at the frame's
 * edge (`cardFit`, `ViewScore`), none wherever the course allows, and
 * around it as many whole topics as it can, the topics that need it (where
 * he goes next) first, then its prerequisites: at full size, or as near it
 * as the readable floor allows when a smaller scale shows more. It may
 * look past the drawing's room by one topic (`slackOf`).
 * `fade` is how far the frame fades in from its sides and from its top and
 * bottom; `tag` the room the current topic's tag takes above its node;
 * `fitsDown` where a course shorter than the frame sits, framed or whole.
 * Pure.
 */
export function framedCamera(layout: TopicMapLayout, focus: TopicHandle | null, frame: Frame, fade: Room, tag = 0, fitsDown: "middle" | "top" = "middle"): Camera {
	const room = { x: fade.x, y: fade.y + tag };
	const whole = wholeZoom(layout, frame, room);
	const middle: Point = [layout.width / 2, layout.height / 2];
	const atTop = (camera: Camera): Camera => (fitsDown === "top" && layout.height * camera.zoom + room.y * 2 <= frame.height ? { ...camera, y: room.y } : camera);
	if (whole >= READABLE_ZOOM) return atTop(cameraAt(layout, middle, whole, frame, room));
	const target = (focus && layout.topics.get(focus)) ?? layout.topics.get(layout.layers[0]?.[0] as TopicHandle);
	if (!target) return cameraAt(layout, middle, 1, frame, room);
	const before = new Set(layout.routes.flatMap((r) => (r.topic === target.handle ? [r.prerequisite] : [])));
	const next = new Set(layout.routes.flatMap((r) => (r.prerequisite === target.handle ? [r.topic] : [])));
	const { width: w, height: h } = layout.node;
	const placed = [...layout.topics.values()];
	const slack = slackOf(layout.node);
	let best: { camera: Camera; score: ViewScore } | null = null;
	for (const zoom of FRAMED_ZOOMS) {
		/** One axis's candidates: the focus at the middle, and each topic's edges on the fade's inner edge and on the
		 *  frame's edge, from inside and from outside, so a topic sits clear, wholly in the fade or wholly out of view;
		 *  inside the drawing, its room (in the frame's pixels at any scale) and `slack` past it; the middle of a drawing
		 *  that fits. */
		const axis = (at: (p: PlacedTopic) => number, size: number, span: number, f: number, extent: number, pad: number, slack: number, mid: number, top = false) => {
			const drawn = extent * zoom;
			if (drawn + pad * 2 <= span) return [Math.round(top ? pad : (span - drawn) / 2)];
			// Rounded inward, so a page that scrolls the course with its room and slack can reach every candidate.
			const [low, high] = [Math.ceil(span - drawn - pad - slack * zoom), Math.floor(pad + slack * zoom)];
			const clamp = (v: number) => Math.min(high, Math.max(low, Math.round(v)));
			const edges = (lo: number, hi: number) => [f - lo, span - f - hi, f - hi, span - f - lo, -lo, -hi, span - hi, span - lo];
			return [...new Set([span / 2 - mid * zoom, ...placed.flatMap((p) => edges(at(p) * zoom, (at(p) + size) * zoom))].map(clamp))];
		};
		const centre = centreOf(layout, target);
		const xs = axis((p) => p.x, w, frame.width, fade.x, layout.width, room.x, slack.x, centre[0]);
		const ys = axis((p) => p.y, h, frame.height, fade.y, layout.height, room.y, slack.y, centre[1], fitsDown === "top");
		const centred = { x: xs[0]!, y: ys[0]! };
		for (const x of xs) {
			for (const y of ys) {
				const left = target.x * zoom + x;
				const top = target.y * zoom + y;
				// The focus wholly clear of the fade, its tag too (to the pixel: candidates are rounded).
				if (left < fade.x - 1 || left + w * zoom > frame.width - fade.x + 1 || top - tag < fade.y - 1 || top + h * zoom > frame.height - fade.y + 1) continue;
				const past = Math.max(0, x - room.x) + Math.max(0, frame.width - room.x - (x + layout.width * zoom)) + Math.max(0, y - room.y) + Math.max(0, frame.height - room.y - (y + layout.height * zoom));
				const score: ViewScore = { cut: 0, nextWhole: 0, cost: (1 - zoom) * VIEW_WORTH.zoom + past + (Math.abs(x - centred.x) + Math.abs(y - centred.y)) / 4 };
				for (const p of placed) {
					if (p === target) continue;
					const l = p.x * zoom + x;
					const t = p.y * zoom + y;
					const fit = cardFit({ left: l, top: t, right: l + w * zoom, bottom: t + h * zoom }, frame, fade, OPENING_SLACK);
					if (fit === "cut") score.cut += 1;
					if ((fit === "clear" || fit === "faded") && next.has(p.handle)) score.nextWhole += 1;
					if (fit === "faded") score.cost += VIEW_WORTH.faded;
					else if (fit === "clear") score.cost -= VIEW_WORTH.whole + (before.has(p.handle) ? VIEW_WORTH.before : next.has(p.handle) ? VIEW_WORTH.next : 0);
				}
				if (!best || ranksAbove(score, best.score)) best = { camera: { x, y, zoom }, score };
			}
		}
	}
	return best?.camera ?? cameraAt(layout, centreOf(layout, target), 1, frame, room);
}
