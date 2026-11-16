/**
 * Tree and neighbours (neighbours.md): one arc drawn exactly as Canvas tree
 * draws it, between a faded band for the arc before and one for the arc
 * after. Pure.
 */

import type { ArcHandle, CourseMap, CourseMapArc, CourseMapTopic, TopicHandle } from "@/src/core";
import type { Point, Route, TopicMapLayout } from "../topic-map-layout";
import type { ArcView } from "../arc-view";
import { CANVAS_NODE } from "../canvas/canvas-layout";

/** A band's name, on its own row above the cards it holds (the arc before) or below them (the arc after). */
export const BAND_LABEL = 24;
/** How much of a neighbour's card shows, the rest cut at the band's edge and faded into it: the arc before's
 *  bottom, its title row; the arc after's top, its header and title row. */
export const PEEK = { before: 44, after: 56 } as const;
/** Room between a band and the arc drawn. */
const BAND_GAP = 48;
/** The lanes that carry the lines from the arc's cards down to the arc after's, 24 apart. */
const LANE = 24;
/** Space between cards side by side. */
const NODE_GAP = 24;

/** A card of a neighbouring arc, at its place in the drawing (the whole card's box; the band shows `PEEK` of it). */
export interface NeighbourCard {
	topic: CourseMapTopic;
	x: number;
	y: number;
}

/** A faded band: the neighbouring arc, its place in study order, its stretch of the drawing and its cards. */
export interface NeighbourBand {
	arc: CourseMapArc;
	number: number;
	side: "before" | "after";
	top: number;
	bottom: number;
	cards: readonly NeighbourCard[];
}

/** A faded line between a neighbour's card and the arc's own, as the lines edge draws it. */
export interface NeighbourLine {
	prerequisite: TopicHandle;
	topic: TopicHandle;
	points: readonly Point[];
}

export interface NeighbourDrawing {
	/** The arc drawn, its place in study order. */
	number: number;
	bands: readonly NeighbourBand[];
	lines: readonly NeighbourLine[];
}

const shiftPoints = (points: readonly Point[], dy: number): Point[] => points.map(([x, y]) => [x, y + dy] as const);

/** A card's box overlaps another's column below it, between two heights. */
function blocked(x: number, from: number, to: number, boxes: readonly { x: number; y: number }[]): boolean {
	return boxes.some((b) => b.y > from && b.y < to && x > b.x && x < b.x + CANVAS_NODE.width);
}

/**
 * The arc's Canvas tree drawing (`base`, laid out on `view`) with its
 * neighbours: the arc before's cards that this arc builds on rise out of
 * its top layer into a faded band above, at the same column, each keeping
 * its lines (now faded) into this arc's cards; that arc's other leaves sit
 * beside them in the band, with no line. The arc after's first cards (its
 * topics that need nothing inside it) sit in a faded band below, each with
 * a faded line from every card here it needs that can drop to it clear of
 * the cards under it. A band is drawn only when its arc exists. Null for a
 * course without arcs or an arc not among them.
 */
export function layoutNeighbours(course: CourseMap, view: ArcView, arc: ArcHandle | undefined, base: TopicMapLayout): { layout: TopicMapLayout; drawing: NeighbourDrawing } | null {
	const arcs = course.arcs ?? [];
	const at = arcs.findIndex((a) => a.handle === arc);
	if (at < 0 || arcs.length < 2) return null;
	const before = arcs[at - 1];
	const after = arcs[at + 1];
	const W = CANVAS_NODE.width;
	const H = CANVAS_NODE.height;
	const topicOf = new Map(course.topics.map((t) => [t.handle, t]));
	const needs = course.edges.filter((e) => e.kind === "needs");

	// The arc before: its cards in the top layer here rise into the band; its other leaves sit beside them.
	const risen = before ? [...base.topics.values()].filter((p) => topicOf.get(p.handle)?.arc === before.handle && view.entry.has(p.handle)) : [];
	const beforeOwn = before ? course.topics.filter((t) => t.arc === before.handle) : [];
	const leaves = beforeOwn.filter((t) => !needs.some((e) => e.prerequisite === t.handle && topicOf.get(e.topic)?.arc === before!.handle) && !risen.some((p) => p.handle === t.handle));
	const top = before ? BAND_LABEL + PEEK.before + BAND_GAP : 0;

	const topics = new Map(base.topics);
	for (const p of risen) topics.delete(p.handle);
	for (const [handle, p] of topics) topics.set(handle, { ...p, y: p.y + top });
	const risenIds = new Set(risen.map((p) => p.handle));
	const routes: Route[] = base.routes.map((r) => ({ ...r, points: shiftPoints(r.points, top) }));
	const lines: NeighbourLine[] = [];
	// A risen card's lines start at its new bottom edge: the first run down simply grows.
	const peekBottom = BAND_LABEL + PEEK.before;
	for (const r of routes) {
		if (!risenIds.has(r.prerequisite) || r.points.length === 0) continue;
		const [first, ...rest] = r.points;
		lines.push({ prerequisite: r.prerequisite, topic: r.topic, points: [[first![0], peekBottom], ...rest] });
	}
	const keptRoutes = routes.filter((r) => !risenIds.has(r.prerequisite) && !risenIds.has(r.topic));

	const bands: NeighbourBand[] = [];
	let right = base.width;
	if (before) {
		const cards: NeighbourCard[] = risen.map((p) => ({ topic: topicOf.get(p.handle)!, x: p.x, y: peekBottom - H }));
		let x = cards.length ? Math.max(...cards.map((c) => c.x + W)) + NODE_GAP : Math.max(0, (base.width - (leaves.length * (W + NODE_GAP) - NODE_GAP)) / 2);
		for (const t of leaves) {
			cards.push({ topic: t, x, y: peekBottom - H });
			x += W + NODE_GAP;
		}
		right = Math.max(right, ...cards.map((c) => c.x + W));
		bands.push({ arc: before, number: at, side: "before", top: 0, bottom: peekBottom, cards });
	}

	let height = base.height + top;
	if (after) {
		const drawnBoxes = [...topics.values()];
		const firstCards = course.topics.filter((t) => t.arc === after.handle && !needs.some((e) => e.topic === t.handle && topicOf.get(e.prerequisite)?.arc === after.handle));
		// Each of the arc after's first cards, with the cards here it needs that drop to it clear of every card below.
		const sources = firstCards.map((t) => {
			const from = needs.flatMap((e) => {
				if (e.topic !== t.handle) return [];
				const p = topics.get(e.prerequisite);
				if (!p) return [];
				const cx = p.x + W / 2;
				return blocked(cx, p.y + H, height + 1, drawnBoxes) ? [] : [{ handle: e.prerequisite, x: cx, bottom: p.y + H }];
			});
			return { topic: t, from };
		});
		const laneCount = new Set(sources.flatMap((s) => s.from.map((f) => f.handle))).size;
		const lanesTop = height + BAND_GAP / 2;
		const cardTop = height + Math.max(BAND_GAP, (laneCount + 1) * LANE);
		// The cards in a row, each under the mean of the columns it is fed from where it can be, else in study order.
		const wanted = sources.map((s) => (s.from.length ? s.from.reduce((a, f) => a + f.x, 0) / s.from.length - W / 2 : null));
		const order = sources.map((_, i) => i).sort((a, b) => (wanted[a] ?? Infinity) - (wanted[b] ?? Infinity) || a - b);
		const cards: NeighbourCard[] = [];
		let next = Math.max(0, (base.width - (sources.length * (W + NODE_GAP) - NODE_GAP)) / 2);
		if (sources.length && wanted.every((w) => w !== null)) next = Math.max(0, wanted[order[0]!]!);
		const placedAt = new Map<number, number>();
		for (const i of order) {
			const x = Math.max(next, wanted[i] ?? next);
			placedAt.set(i, x);
			cards.push({ topic: sources[i]!.topic, x, y: cardTop });
			next = x + W + NODE_GAP;
		}
		const laneOf = new Map([...new Set(sources.flatMap((s) => s.from.map((f) => f.handle)))].map((h, i) => [h, i]));
		sources.forEach((s, i) => {
			const tx = placedAt.get(i)! + W / 2;
			for (const f of s.from) {
				const y = lanesTop + laneOf.get(f.handle)! * LANE;
				lines.push({
					prerequisite: f.handle,
					topic: s.topic.handle,
					points: f.x === tx ? [[f.x, f.bottom], [tx, cardTop]] : [[f.x, f.bottom], [f.x, y], [tx, y], [tx, cardTop]],
				});
			}
		});
		right = Math.max(right, ...cards.map((c) => c.x + W));
		height = cardTop + PEEK.after + BAND_LABEL;
		bands.push({ arc: after, number: at + 2, side: "after", top: cardTop, bottom: height, cards });
	}

	return {
		layout: {
			node: base.node,
			width: right,
			height,
			topics,
			routes: keptRoutes,
			layers: base.layers.map((layer) => layer.filter((h) => !risenIds.has(h))).filter((layer) => layer.length > 0),
		},
		drawing: { number: at + 1, bands, lines },
	};
}
