/**
 * Bands (bands.md): the course's arcs stacked top to bottom as chapters in
 * study order, each arc's topics in layers of their own under its number
 * and pill in the margin, a hairline between chapters. The drawing is one
 * Canvas tree, so a need from an earlier chapter runs down into a later one
 * in the same grammar, on its prerequisite's one bracket. Pure.
 */

import type { ArcHandle, CourseMapArc, CourseMapEdge, CourseMapTopic, TopicHandle } from "@/src/core";
import type { PlacedTopic, Route, TopicMapLayout } from "../topic-map-layout";
import type { ArcsShown } from "../map-skin";
import { CANVAS_NODE, layeredDrawing, layoutCanvas, transitiveReduction, type Need } from "../canvas/canvas-layout";
import { arcsOfTopics } from "../arcs/arc-layout";

/** A chapter's header strip, above its first cards: the hairline at its top, its number and pill 8 under it, and
 *  room under the pill for "You are here" over a card in its first layer. */
export const BAND_HEAD = 56;
/** The margin's room for a chapter's number and pill beside the cards, and the space before the cards. */
const MARGIN_GAP = 32;
/** A margin wide enough for the widest arc's pill, its name whole (SF Pro at the pill's 12px averages under
 *  7px a character; the number, ring and padding take 60). */
export function marginFor(arcs: readonly CourseMapArc[]): number {
	return Math.max(160, ...arcs.map((a) => 60 + 7 * a.title.length)) + MARGIN_GAP;
}

/** One chapter: its arc, number, and the stretch of the drawing it takes, top to bottom. */
export interface Band {
	arc: CourseMapArc;
	number: number;
	top: number;
	bottom: number;
	topics: readonly TopicHandle[];
	here: boolean;
	/** Where lines cross the rule at its top, left to right: the rule stops short of each (`RULE_CLEAR`). */
	crossings: readonly number[];
}

/** How far a chapter's rule stops short of a line crossing it, on each side. */
export const RULE_CLEAR = 12;

/** The rule over a chapter as the stretches left between the lines crossing it, from `from` to `to`. Pure. */
export function ruleStretches(from: number, to: number, crossings: readonly number[]): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	let at = from;
	for (const x of [...crossings].sort((a, b) => a - b)) {
		if (x - RULE_CLEAR > at) out.push([at, x - RULE_CLEAR]);
		at = Math.max(at, x + RULE_CLEAR);
	}
	if (to > at) out.push([at, to]);
	return out;
}

/**
 * The course in bands: each topic's layer is its chapter's first layer
 * plus the longest chain of its own chapter's needs above it, so every arc
 * starts below the one before it; the drawing is the canvas's, shifted
 * right of the margin. Null when a need runs from a later arc to an
 * earlier one, which chapters in order cannot draw.
 */
export function layoutBands(topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[], shown: ArcsShown): { layout: TopicMapLayout; bands: Band[]; margin: number } | null {
	const needs = edges.filter((e): e is Need => e.kind === "needs");
	const arcOf = arcsOfTopics(topics, edges, shown.arcs);
	const order = new Map<ArcHandle, number>(shown.arcs.map((a, i) => [a.handle, i]));
	if (needs.some((n) => order.get(arcOf.get(n.prerequisite)!)! > order.get(arcOf.get(n.topic)!)!)) return null;
	// Only needs inside a chapter and from the chapter just before are drawn (Edo, 16 Nov 2026: long lines through
	// the chapters "just looks weird"); a need from further back lights with its topic in focus.
	const step = (n: Need) => order.get(arcOf.get(n.topic)!)! - order.get(arcOf.get(n.prerequisite)!)!;
	const drawn = transitiveReduction(needs).filter((n) => step(n) <= 1);
	const depthIn = new Map<TopicHandle, number>();
	const local = (t: TopicHandle): number => {
		const known = depthIn.get(t);
		if (known !== undefined) return known;
		const own = drawn.filter((n) => n.topic === t && arcOf.get(n.prerequisite) === arcOf.get(t));
		const d = own.length ? 1 + Math.max(...own.map((n) => local(n.prerequisite))) : 0;
		depthIn.set(t, d);
		return d;
	};
	const firstLayer: number[] = [];
	let next = 0;
	for (const arc of shown.arcs) {
		firstLayer.push(next);
		const own = topics.filter((t) => arcOf.get(t.handle) === arc.handle);
		next += own.length ? 1 + Math.max(...own.map((t) => local(t.handle))) : 0;
	}
	const layerOf = new Map(topics.map((t) => [t.handle as string, firstLayer[order.get(arcOf.get(t.handle)!)!]! + local(t.handle)]));
	const starts = new Set(firstLayer);
	const drawing = layeredDrawing(
		topics.map((t) => ({ id: t.handle, ...CANVAS_NODE })),
		drawn.map((n) => ({ source: n.prerequisite, target: n.topic })),
		{ layerOf: (id) => layerOf.get(id)!, headerAbove: (layer) => (starts.has(layer) ? BAND_HEAD : 0) },
	);
	const margin = marginFor(shown.arcs);
	const placed = new Map<TopicHandle, PlacedTopic>();
	for (const [id, box] of drawing.boxes) placed.set(id as TopicHandle, { handle: id as TopicHandle, x: box.x + margin, y: box.y, layer: box.layer });
	const shift = (points: readonly (readonly [number, number])[]) => points.map(([x, y]) => [x + margin, y] as const);
	const routes: Route[] = needs.map((n) => ({ prerequisite: n.prerequisite, topic: n.topic, points: shift(drawing.lines.get(`${n.prerequisite}>${n.topic}`) ?? []) }));
	const height = drawing.height;
	// A chapter starts at the hairline over its first layer, so the room above its cards is its own.
	const tops = shown.arcs.map((_, i) => drawing.layerTops[firstLayer[i]!]! - BAND_HEAD);
	/** Where the drawn lines cross a height: their vertical runs over it. */
	const crossingsAt = (y: number) =>
		routes.flatMap((r) => r.points.slice(1).flatMap(([x, y1], k) => {
			const [x0, y0] = r.points[k]!;
			return x0 === x && Math.min(y0, y1) < y && Math.max(y0, y1) > y ? [x] : [];
		}));
	const bands: Band[] = shown.arcs.map((arc, i) => ({
		arc,
		number: i + 1,
		top: tops[i]!,
		bottom: i + 1 < tops.length ? tops[i + 1]! : height,
		topics: topics.filter((t) => arcOf.get(t.handle) === arc.handle).map((t) => t.handle),
		here: arc.handle === shown.current,
		crossings: [...new Set(crossingsAt(tops[i]!))],
	}));
	return { layout: { node: CANVAS_NODE, width: drawing.width + margin, height, topics: placed, routes, layers: drawing.layers as TopicHandle[][] }, bands, margin };
}

/** Bands, or Canvas tree for a course whose arcs cannot be drawn in order. */
export function layoutBandsOrTree(topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[], top: ReadonlySet<TopicHandle> | undefined, shown: ArcsShown | undefined) {
	const bands = shown ? layoutBands(topics, edges, shown) : null;
	return bands ?? { layout: layoutCanvas(topics, edges, top), bands: [] as Band[], margin: 0 };
}
