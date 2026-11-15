/**
 * The canvas's geometry (canvas.md, Layout and lines): its own layered
 * drawing, top to bottom with prerequisites above the topics that need
 * them, placed so each card sits over what it leads to, and each need
 * drawn in one grammar: out of the prerequisite's bottom centre, across
 * on its prerequisite's bracket, and into the topic's top centre. Pure.
 */

import { coordSimplex, decrossOpt, decrossTwoLayer, graphStratify, layeringSimplex, sugiyama, type Layering } from "d3-dag";
import type { CourseMapEdge, CourseMapTopic, TopicHandle } from "@/src/core";
import { layoutTopicMap, type PlacedTopic, type Point, type Route, type TopicMapLayout } from "../topic-map-layout";

/** A card on the canvas: a header strip over its title. */
export const CANVAS_NODE = { width: 232, height: 68 } as const;
/** Space between cards in a layer, and between a line through a layer and the cards beside it. */
const NODE_GAP = 24;
/** The least space between layers. */
const GAP = 48;
/** The least space between two lines side by side, and between a bracket and the cards above and below it. */
const LANE = 24;
/** How far a line's corner bends. */
const CORNER = 8;
/** Optimal decrossing up to this many topics, the two-layer heuristic above (d3-dag: optimal decrossing is for small graphs only). */
const OPTIMAL_DECROSS_LIMIT = 25;
/** A sideways step shorter than this reads as a nudge, not a turn: a card that can sit straight over or under its neighbour does. */
const NUDGE = 48;
/** Up to this many brackets in a gap, every order of them is tried. */
const EXACT_LANES = 6;

export type Need = Extract<CourseMapEdge, { kind: "needs" }>;

/**
 * The needs no longer path implies: a need of B on A is implied when B
 * also needs something that itself needs A, however far back. The
 * prerequisite chains stay whole; only their shortcuts go. Pure.
 */
export function transitiveReduction(needs: readonly Need[]): Need[] {
	const parents = new Map<TopicHandle, TopicHandle[]>();
	for (const n of needs) parents.set(n.topic, [...(parents.get(n.topic) ?? []), n.prerequisite]);
	const ancestors = new Map<TopicHandle, Set<TopicHandle>>();
	const above = (handle: TopicHandle): Set<TopicHandle> => {
		const known = ancestors.get(handle);
		if (known) return known;
		const found = new Set<TopicHandle>();
		ancestors.set(handle, found);
		for (const p of parents.get(handle) ?? []) for (const a of [p, ...above(p)]) found.add(a);
		return found;
	};
	return needs.filter((n) => !(parents.get(n.topic) ?? []).some((p) => p !== n.prerequisite && above(p).has(n.prerequisite)));
}

/** The rank that holds `top` in the first layer: 0 for those, 1 for every other topic with no prerequisite drawn. */
function rankUnder(top: ReadonlySet<string>, parents: ReadonlyMap<string, readonly string[]>, id: string): number | undefined {
	if (top.has(id)) return 0;
	return (parents.get(id) ?? []).length === 0 ? 1 : undefined;
}

/** One stretch of a line across a gap: from `from` on the gap's top to `to` on its bottom. */
interface Crossing {
	route: number;
	gap: number;
	from: number;
	to: number;
	/** Crossings with one key share a bracket: the stretches leaving one prerequisite, or several that lead to the same columns. */
	key: string;
}

/** A bracket: the crossings of one key that move sideways, and the stretch of the gap it spans. */
interface Bracket {
	members: Crossing[];
	low: number;
	high: number;
}

/**
 * Each bracket in a gap gets a lane, 0 nearest the gap's top: in the order
 * that crosses the fewest lines, LANE apart from any bracket it would run
 * beside. Two brackets that only meet where both drop into one card share
 * a lane, so the needs arriving there read as one line into it.
 */
function lanesOf(crossings: readonly Crossing[]): Map<Crossing, number> {
	const groups = new Map<string, Crossing[]>();
	for (const c of crossings) if (c.from !== c.to) groups.set(c.key, [...(groups.get(c.key) ?? []), c]);
	const spans: Bracket[] = [...groups.values()].map((members) => {
		const xs = members.flatMap((c) => [c.from, c.to]);
		return { members, low: Math.min(...xs), high: Math.max(...xs) };
	});
	const inside = (x: number, s: Bracket) => x > s.low + 0.5 && x < s.high - 0.5;
	// A bracket above another crosses the other's trunk from the gap's top, and the other crosses its drops to the gap's
	// bottom; and a drop onto the other's trunk would run down it, as if it led where the other leads: that costs most.
	const onTrunk = (above: Bracket, below: Bracket) => above.members.filter((c) => below.members.some((d) => Math.abs(d.from - c.to) < 0.5)).length;
	const cost = (above: Bracket, below: Bracket) =>
		below.members.filter((c) => inside(c.from, above)).length + above.members.filter((c) => inside(c.to, below)).length + 10 * onTrunk(above, below);
	const total = (order: readonly Bracket[]) => order.reduce((n, a, i) => n + order.slice(i + 1).reduce((m, b) => m + cost(a, b), 0), 0);
	let order: Bracket[] = [];
	for (const span of spans.sort((a, b) => a.low - b.low || a.high - b.high)) {
		let at = order.length;
		while (at > 0 && cost(span, order[at - 1]!) < cost(order[at - 1]!, span)) at--;
		order.splice(at, 0, span);
	}
	if (spans.length <= EXACT_LANES) {
		const orders = (left: readonly Bracket[]): Bracket[][] => (left.length <= 1 ? [[...left]] : left.flatMap((s, i) => orders(left.filter((_, k) => k !== i)).map((rest) => [s, ...rest])));
		for (const candidate of orders(order)) if (total(candidate) < total(order)) order = candidate;
	}
	const drops = (s: Bracket) => new Set(s.members.map((c) => c.to));
	const meetInto = (a: Bracket, b: Bracket) => {
		const at = a.high <= b.low + 0.5 ? a.high : b.high <= a.low + 0.5 ? b.high : null;
		return at !== null && Math.abs((a.high <= b.low + 0.5 ? b.low : a.low) - at) < 0.5 && drops(a).has(at) && drops(b).has(at);
	};
	const beside = (a: Bracket, b: Bracket) => a.low < b.high + LANE && b.low < a.high + LANE && !meetInto(a, b);
	const lanes = new Map<Crossing, number>();
	const placed: { span: Bracket; lane: number }[] = [];
	for (const span of order) {
		const lane = Math.max(-1, ...placed.filter((p) => beside(p.span, span)).map((p) => p.lane)) + 1;
		placed.push({ span, lane });
		for (const c of span.members) lanes.set(c, lane);
	}
	return lanes;
}

/**
 * d3-dag's places with each nudge taken out (`NUDGE`): a card moves onto
 * the column of a card it links to whenever that leaves fewer short side
 * steps and turns among its links, and keeps clear of everything in its
 * layer, cards and the lines passing through it, so order and spacing
 * hold. Returns each card's new centre.
 */
function straighten(
	nodes: readonly { id: string; layer: number; x: number; width: number }[],
	links: readonly { source: string; target: string; columns: readonly number[]; layer: number }[],
): Map<string, number> {
	const x = new Map(nodes.map((n) => [n.id, n.x]));
	const layerOf = new Map(nodes.map((n) => [n.id, n.layer]));
	const cost = (dx: number) => (Math.abs(dx) < 0.5 ? 0 : Math.abs(dx) < NUDGE ? 3 : 1);
	/** A card's neighbouring columns: through each link, the next column along it. */
	const ends = (id: string) =>
		links.flatMap((l) => [...(l.source === id ? [l.columns.length > 2 ? l.columns[1]! : x.get(l.target)!] : []), ...(l.target === id ? [l.columns.length > 2 ? l.columns.at(-2)! : x.get(l.source)!] : [])]);
	/** What else sits in a layer: the other cards, each its own width, and the lines passing through it. */
	const others = (id: string) => {
		const layer = layerOf.get(id)!;
		return [
			...nodes.filter((n) => n.id !== id && n.layer === layer).map((n) => ({ at: x.get(n.id)!, half: n.width / 2 })),
			...links.flatMap((l) => l.columns.slice(1, -1).flatMap((c, k) => (l.layer + 1 + k === layer ? [{ at: c, half: 0 }] : []))),
		];
	};
	/** Two prerequisites that both lead to two topics can't each sit straight over one of them: each one's line to the
	 *  other topic would have to run down the other's straight line. Whether moving `id` to `at` makes such a pair. */
	const linked = (a: string, b: string) => links.some((l) => l.columns.length === 2 && ((l.source === a && l.target === b) || (l.source === b && l.target === a)));
	const straight = (a: string, b: string, xa: number, xb: number) => linked(a, b) && Math.abs(xa - xb) < 0.5;
	const crossedStraight = (id: string, at: number) => {
		const xOf = (other: string) => (other === id ? at : x.get(other)!);
		const across = (a: string) => links.flatMap((l) => (l.columns.length !== 2 ? [] : l.source === a ? [l.target] : l.target === a ? [l.source] : []));
		return across(id).some((p) => straight(id, p, at, xOf(p)) && nodes.some((q) => q.id !== id && q.layer === layerOf.get(id) && linked(q.id, p) && across(q.id).some((r) => r !== p && linked(id, r) && straight(q.id, r, xOf(q.id), xOf(r)))));
	};
	for (let pass = 0; pass < 4; pass++) {
		let moved = false;
		for (const n of nodes) {
			const here = x.get(n.id)!;
			const near = ends(n.id);
			const score = (at: number) => near.reduce((s, e) => s + cost(e - at), 0);
			const beside = others(n.id);
			const free = (at: number) => beside.every((o) => Math.abs(o.at - at) >= o.half + n.width / 2 + NODE_GAP - 0.5 && Math.sign(o.at - at) === Math.sign(o.at - here));
			const best = near.filter((at) => free(at) && score(at) < score(here) && !crossedStraight(n.id, at)).sort((a, b) => score(a) - score(b) || Math.abs(a - here) - Math.abs(b - here))[0];
			if (best !== undefined) {
				x.set(n.id, best);
				moved = true;
			}
		}
		if (!moved) break;
	}
	return x;
}

/** A polyline without the points that sit on a straight run. */
function corners(points: readonly Point[]): Point[] {
	const kept: Point[] = [];
	for (const p of points) {
		const last = kept.at(-1);
		if (last && last[0] === p[0] && last[1] === p[1]) continue;
		const before = kept.at(-2);
		if (last && before && (before[0] === last[0]) === (last[0] === p[0]) && (before[1] === last[1]) === (last[1] === p[1])) kept.pop();
		kept.push(p);
	}
	return kept;
}

/** A box to place: a topic's card, or a group of them. */
export interface DrawnNode {
	id: string;
	width: number;
	height: number;
}

/** A box placed, its top left corner and the layer it sits in. */
export interface PlacedBox extends DrawnNode {
	x: number;
	y: number;
	layer: number;
}

/** What a layered drawing may be asked for besides its boxes and links. */
export interface LayeredOptions {
	/** Held in the first layer (an arc's entry topics). */
	top?: ReadonlySet<string>;
	/** Each box's layer, when the caller sets them (every link must go down at least one); unset, d3-dag's simplex
	 *  layering chooses. */
	layerOf?: (id: string) => number;
	/** Room kept clear just above a layer, under the lines that reach it (a band's header). */
	headerAbove?: (layer: number) => number;
}

/** Boxes in layers with their links, each link `source>target` as its corners. */
export interface LayeredDrawing {
	width: number;
	height: number;
	boxes: Map<string, PlacedBox>;
	lines: Map<string, Point[]>;
	layers: string[][];
	/** Each layer's top, and the top of the room kept above it. */
	layerTops: number[];
}

/**
 * A layered drawing (canvas.md, Layout and lines): a Sugiyama drawing of
 * the boxes and links, its order chosen for the fewest crossings and its
 * places for each box centred over what it leads to, a link that skips
 * layers running down a column of its own. Every link leaves its source's
 * bottom centre and reaches its target's top centre; between layers it
 * runs on its source's bracket, each gap as deep as its brackets need.
 * Boxes in a layer share its top. A link's points are its corners. Pure.
 */
export function layeredDrawing(nodes: readonly DrawnNode[], links: readonly { source: string; target: string }[], options: LayeredOptions = {}): LayeredDrawing {
	const size = new Map(nodes.map((n) => [n.id, n]));
	const parents = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
	for (const link of links) parents.get(link.target)?.push(link.source);
	const dag = graphStratify()(nodes.map((n) => ({ id: n.id, parentIds: parents.get(n.id) ?? [] })));
	const top = options.top ?? new Set<string>();
	const fixed = options.layerOf;
	const given: Layering<{ id: string }, unknown> = (graph) => {
		let deepest = 0;
		for (const node of graph.nodes()) {
			node.y = fixed!(node.data.id);
			deepest = Math.max(deepest, node.y);
		}
		return deepest;
	};
	const layering: Layering<{ id: string }, unknown> = fixed
		? given
		: top.size > 0
			? layeringSimplex().rank(({ data }: { data: { id: string } }) => rankUnder(top, parents, data.id))
			: layeringSimplex();
	sugiyama()
		.nodeSize((node: { data?: { id: string } }) => {
			const box = node.data ? size.get(node.data.id) : undefined;
			return box ? [box.width, box.height] : [0, 0];
		})
		.gap([NODE_GAP, GAP])
		.layering(layering)
		.decross(nodes.length <= OPTIMAL_DECROSS_LIMIT ? decrossOpt() : decrossTwoLayer())
		.coord(coordSimplex())(dag);

	const layerYs = [...new Set([...dag.nodes()].map((n) => n.y))].sort((a, b) => a - b);
	const columnsOf = [...dag.links()].map((link) => link.points.map(([x]) => x));
	straighten(
		[...dag.nodes()].map((n) => ({ id: n.data.id, layer: layerYs.indexOf(n.y), x: n.x, width: size.get(n.data.id)!.width })),
		[...dag.links()].map((link, i) => ({ source: link.source.data.id, target: link.target.data.id, columns: columnsOf[i]!, layer: layerYs.indexOf(link.source.y) })),
	).forEach((x, id) => {
		for (const n of dag.nodes()) if (n.data.id === id) n.x = x;
	});
	const layers: string[][] = layerYs.map(() => []);
	const centreOf = new Map<string, number>();
	const layerOf = new Map<string, number>();
	for (const at of dag.nodes()) {
		centreOf.set(at.data.id, at.x);
		layerOf.set(at.data.id, layerYs.indexOf(at.y));
		layers[layerYs.indexOf(at.y)]!.push(at.data.id);
	}
	for (const layer of layers) layer.sort((a, b) => centreOf.get(a)! - centreOf.get(b)!);
	const heightOf = layers.map((layer) => Math.max(0, ...layer.map((id) => size.get(id)!.height)));

	// Each link's column in every layer it spans: its source's centre, d3-dag's dummy places, its target's centre.
	const drawn = [...dag.links()].map((link, i) => ({
		source: link.source.data.id,
		target: link.target.data.id,
		columns: [link.source.x, ...columnsOf[i]!.slice(1, -1), link.target.x],
	}));
	// Sources that lead to the very same columns in a gap share one bracket: each of them reaches each of those.
	const leadsTo = new Map<string, number[]>();
	for (const link of drawn) leadsTo.set(link.source, [...(leadsTo.get(link.source) ?? []), link.columns[1]!]);
	const bracketOf = (source: string) => `from:${layerOf.get(source)}:${[...new Set(leadsTo.get(source))].sort((a, b) => a - b).join(",")}`;
	const crossings = drawn.flatMap((link, i) =>
		link.columns.slice(0, -1).map((from, k): Crossing => ({ route: i, gap: layerOf.get(link.source)! + k, from, to: link.columns[k + 1]!, key: k === 0 ? bracketOf(link.source) : `route:${i}` })),
	);
	const lane = new Map<Crossing, number>();
	const laneCount: number[] = layers.map(() => 0);
	const depth = layers.map(() => GAP);
	const header = (layer: number) => options.headerAbove?.(layer) ?? 0;
	for (let gap = 0; gap < layers.length - 1; gap++) {
		const lanes = lanesOf(crossings.filter((c) => c.gap === gap));
		for (const [c, n] of lanes) lane.set(c, n);
		laneCount[gap] = Math.max(-1, ...lanes.values()) + 1;
		depth[gap] = Math.max(GAP, (laneCount[gap]! + 1) * LANE);
	}
	const layerTop: number[] = [header(0)];
	for (let i = 1; i < layers.length; i++) layerTop.push(layerTop[i - 1]! + heightOf[i - 1]! + depth[i - 1]! + header(i));

	// The drawing starts at its leftmost box or line.
	const halfOf = (id: string) => size.get(id)!.width / 2;
	const left = Math.min(...[...centreOf].map(([id, x]) => x - halfOf(id)), ...drawn.flatMap((l) => l.columns));
	const right = Math.max(...[...centreOf].map(([id, x]) => x + halfOf(id)), ...drawn.flatMap((l) => l.columns));
	for (const [id, x] of centreOf) centreOf.set(id, x - left);
	for (const link of drawn) link.columns = link.columns.map((x) => x - left);
	const boxes = new Map<string, PlacedBox>();
	for (const [id, x] of centreOf) boxes.set(id, { ...size.get(id)!, x: x - halfOf(id), y: layerTop[layerOf.get(id)!]!, layer: layerOf.get(id)! });
	const lines = new Map<string, Point[]>();
	drawn.forEach((link, i) => {
		const from = boxes.get(link.source)!;
		const points: Point[] = [[link.columns[0]!, from.y + from.height]];
		for (const c of crossings.filter((c) => c.route === i)) {
			const n = lane.get(c);
			if (n === undefined) continue;
			// The gap's lanes sit in its middle, LANE apart, above any room kept for the next layer.
			const y = layerTop[c.gap]! + heightOf[c.gap]! + depth[c.gap]! / 2 + (n - (laneCount[c.gap]! - 1) / 2) * LANE;
			points.push([c.from, y], [c.to, y]);
		}
		points.push([link.columns.at(-1)!, layerTop[layerOf.get(link.target)!]!]);
		lines.set(`${link.source}>${link.target}`, corners(points));
	});
	const last = layers.length - 1;
	return { width: right - left, height: layerTop[last]! + heightOf[last]!, boxes, lines, layers, layerTops: layerTop };
}

/**
 * The course top to bottom (canvas.md, Layout and lines): a layered
 * drawing (`layeredDrawing`) of the needs no longer path implies
 * (`transitiveReduction`), every card the same size. An implied need keeps
 * its route with no points, and the chain that implies it is its line.
 */
export function layoutCanvas(topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[], top: ReadonlySet<TopicHandle> = new Set()): TopicMapLayout {
	const needs = edges.filter((e): e is Need => e.kind === "needs");
	if (needs.length === 0) return layoutTopicMap(topics, edges, CANVAS_NODE, top);
	const drawing = layeredDrawing(
		topics.map((t) => ({ id: t.handle, ...CANVAS_NODE })),
		transitiveReduction(needs).map((n) => ({ source: n.prerequisite, target: n.topic })),
		{ top },
	);
	return asTopicLayout(drawing, needs);
}

/** A drawing of topic cards as the map's layout: every need with its line, none for one its chain implies. */
export function asTopicLayout(drawing: LayeredDrawing, needs: readonly Need[]): TopicMapLayout {
	const placed = new Map<TopicHandle, PlacedTopic>();
	for (const [id, box] of drawing.boxes) placed.set(id as TopicHandle, { handle: id as TopicHandle, x: box.x, y: box.y, layer: box.layer });
	const routes: Route[] = needs.map((n) => ({ prerequisite: n.prerequisite, topic: n.topic, points: drawing.lines.get(`${n.prerequisite}>${n.topic}`) ?? [] }));
	return { node: CANVAS_NODE, width: drawing.width, height: drawing.height, topics: placed, routes, layers: drawing.layers as TopicHandle[][] };
}

/** A route's corners as an SVG path, each corner rounded by up to `CORNER`. Pure. */
export function orthogonalPath(points: readonly Point[]): string {
	const [start, ...rest] = points;
	if (!start) return "";
	let d = `M${start[0]},${start[1]}`;
	rest.forEach((at, i) => {
		const before = points[i]!;
		const after = rest[i + 1];
		if (!after) {
			d += ` L${at[0]},${at[1]}`;
			return;
		}
		const inLen = Math.hypot(at[0] - before[0], at[1] - before[1]);
		const outLen = Math.hypot(after[0] - at[0], after[1] - at[1]);
		const k = Math.min(CORNER, inLen / 2, outLen / 2);
		if (k < 0.5) {
			d += ` L${at[0]},${at[1]}`;
			return;
		}
		const a: Point = [at[0] - ((at[0] - before[0]) / inLen) * k, at[1] - ((at[1] - before[1]) / inLen) * k];
		const b: Point = [at[0] + ((after[0] - at[0]) / outLen) * k, at[1] + ((after[1] - at[1]) / outLen) * k];
		d += ` L${a[0]},${a[1]} Q${at[0]},${at[1]} ${b[0]},${b[1]}`;
	});
	return d;
}
