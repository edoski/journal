/**
 * Bands (bands.md): the course's arcs stacked top to bottom as chapters in
 * study order, each arc's topics in layers of their own under its number
 * and name in the margin, a hairline between chapters. Its cards stand on
 * one grid of columns through every chapter, each chain down one column,
 * and each prerequisite's lines run as one trunk into the chapters below
 * (`bands-routes.ts`). Pure.
 */

import type { ArcHandle, CourseMapArc, CourseMapEdge, CourseMapTopic, TopicHandle } from "@/src/core";
import type { PlacedTopic, Route, TopicMapLayout } from "../topic-map-layout";
import type { ArcsShown } from "../map-skin";
import { CANVAS_NODE, layoutCanvas, transitiveReduction, type Need } from "../canvas/canvas-layout";
import { routeTrunks } from "./bands-routes";
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

/** Space between two columns of cards: a line in the gutter between them runs a lane from each. */
const COLUMN_GAP = 48;
/** A column's width with the gutter after it. */
const PITCH = CANVAS_NODE.width + COLUMN_GAP;
/** The least space between rows, and between two lanes or a lane and the cards above it. */
const GAP = 48;
const LANE = 24;
/** How many times every row tries its moves, at most (`settle`). */
const SETTLE_PASSES = 2;
/** What a drawing costs (`settle`), per crossing and per topic strayed, against 1 per column it takes. */
const COST = { crossing: 10, stray: 2 };
/** How far a topic strays: under another of its prerequisites, or under none. */
const STRAY = { other: 0.5, none: 1 };

/**
 * Each topic's column (bands.md, Places): row by row, top to bottom, a
 * topic takes the column of the prerequisite it follows (the nearest above
 * it, one in its own chapter first), so a chain runs down one column
 * through the chapters; where several follow one card, the one with the
 * longest chain under it keeps the column and the rest take the nearest
 * free ones, towards their other prerequisites. A topic that follows
 * nothing drawn takes the leftmost free column. Pure.
 */
function columnsOf(rows: readonly (readonly TopicHandle[])[], drawn: readonly Need[], arcOf: ReadonlyMap<TopicHandle, ArcHandle>, rowOf: ReadonlyMap<TopicHandle, number>, study: ReadonlyMap<TopicHandle, number>): Map<TopicHandle, number> {
	const col = new Map<TopicHandle, number>();
	const parentsOf = (t: TopicHandle) => drawn.filter((n) => n.topic === t).map((n) => n.prerequisite);
	const below = new Map<TopicHandle, number>();
	const chain = (t: TopicHandle): number => {
		const known = below.get(t);
		if (known !== undefined) return known;
		const kids = drawn.filter((n) => n.prerequisite === t).map((n) => n.topic);
		const d = kids.length ? 1 + Math.max(...kids.map(chain)) : 0;
		below.set(t, d);
		return d;
	};
	for (const row of rows) {
		const taken = new Set<number>();
		const main = (t: TopicHandle) =>
			parentsOf(t).sort((p, q) => rowOf.get(q)! - rowOf.get(p)! || Number(arcOf.get(q) === arcOf.get(t)) - Number(arcOf.get(p) === arcOf.get(t)) || col.get(p)! - col.get(q)!)[0];
		const byClaim = [...row].sort((p, q) => chain(q) - chain(p) || study.get(p)! - study.get(q)!);
		const later: TopicHandle[] = [];
		for (const t of byClaim) {
			const m = main(t);
			if (m !== undefined && !taken.has(col.get(m)!)) {
				col.set(t, col.get(m)!);
				taken.add(col.get(m)!);
			} else later.push(t);
		}
		for (const t of later) {
			const ps = parentsOf(t).map((p) => col.get(p)!);
			const m = main(t);
			const want = m === undefined ? 0 : col.get(m)!;
			const towards = ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : 0;
			let best = -1;
			for (let c = 0; c <= row.length + taken.size + Math.max(0, ...col.values()) + 1; c++) {
				if (taken.has(c)) continue;
				if (best < 0) {
					best = c;
					continue;
				}
				const score = (k: number) => (m === undefined ? k : Math.abs(k - want) * 1000 + Math.abs(k - towards) * 10 + k);
				if (score(c) < score(best)) best = c;
			}
			col.set(t, best);
			taken.add(best);
		}
	}
	return col;
}

/**
 * The columns moved where the lines read cleaner (bands.md, Places): a
 * topic not under the prerequisite it follows tries every free column in
 * its row, and every two topics in a row try each other's columns, keeping
 * a move only when the drawing costs less (`cost`: its lines' crossings,
 * then how far its topics stray from the cards they follow, then its
 * columns). Pure.
 */
function settle(start: Map<TopicHandle, number>, rows: readonly (readonly TopicHandle[])[], cost: (col: ReadonlyMap<TopicHandle, number>) => number, aligned: (t: TopicHandle, col: ReadonlyMap<TopicHandle, number>) => boolean): Map<TopicHandle, number> {
	let col = start;
	let best = cost(col);
	for (let pass = 0; pass < SETTLE_PASSES; pass++) {
		let moved = false;
		for (const row of rows) {
			const tries: Map<TopicHandle, number>[] = [];
			const taken = new Set(row.map((o) => col.get(o)!));
			const widest = Math.max(...col.values()) + 1;
			for (const t of row) {
				if (aligned(t, col)) continue;
				for (let c = 0; c <= widest; c++) if (!taken.has(c)) tries.push(new Map(col).set(t, c));
			}
			row.forEach((t, i) => row.slice(i + 1).forEach((o) => tries.push(new Map(col).set(t, col.get(o)!).set(o, col.get(t)!))));
			for (const next of tries) {
				const c = cost(next);
				if (c < best) {
					best = c;
					col = next;
					moved = true;
				}
			}
		}
		if (!moved) break;
	}
	return col;
}

/**
 * The course in bands: each topic's layer is its chapter's first layer
 * plus the longest chain of its own chapter's needs above it, so every arc
 * starts below the one before it; its column follows the prerequisite it
 * follows (`columnsOf`), and every prerequisite's lines run as one trunk
 * (`routeTrunks`), all right of the margin. Null when a need runs from a
 * later arc to an earlier one, which chapters in order cannot draw.
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
	const rowOf = new Map(topics.map((t) => [t.handle, firstLayer[order.get(arcOf.get(t.handle)!)!]! + local(t.handle)]));
	const rowCount = Math.max(0, ...rowOf.values()) + 1;
	const rows: TopicHandle[][] = Array.from({ length: rowCount }, () => []);
	topics.forEach((t) => rows[rowOf.get(t.handle)!]!.push(t.handle));
	const study = new Map(topics.map((t, i) => [t.handle, i]));
	const W = CANVAS_NODE.width;
	const H = CANVAS_NODE.height;
	const xOf = (c: number) => c * PITCH + W / 2;
	const links = drawn.map((n) => ({ source: n.prerequisite, target: n.topic }));
	const route = (col: ReadonlyMap<TopicHandle, number>) => {
		const cards = topics.map((t) => ({ id: t.handle as string, row: rowOf.get(t.handle)!, x: xOf(col.get(t.handle)!) }));
		const spans = new Map<number, [number, number][]>();
		for (const c of cards) spans.set(c.row, [...(spans.get(c.row) ?? []), [c.x - W / 2, c.x + W / 2]]);
		const columns = Math.max(0, ...col.values()) + 1;
		const channels = [...Array.from({ length: columns }, (_, c) => xOf(c)), ...Array.from({ length: columns + 1 }, (_, c) => c * PITCH - COLUMN_GAP / 2)];
		return { trunks: routeTrunks(cards, links, spans, channels, LANE), columns };
	};
	const parentsOf = new Map(topics.map((t) => [t.handle, drawn.filter((n) => n.topic === t.handle).map((n) => n.prerequisite)]));
	/** The prerequisite a topic follows: its nearest above, one in its own chapter first. */
	const mainOf = new Map(topics.map((t) => [t.handle, [...parentsOf.get(t.handle)!].sort((p, q) => rowOf.get(q)! - rowOf.get(p)! || Number(arcOf.get(q) === arcOf.get(t.handle)) - Number(arcOf.get(p) === arcOf.get(t.handle)))[0]]));
	const aligned = (t: TopicHandle, c: ReadonlyMap<TopicHandle, number>) => mainOf.get(t) !== undefined && c.get(mainOf.get(t)!) === c.get(t);
	/** How far a topic strays: none under the card it follows, a little under another of its prerequisites, more under none. */
	const stray = (t: TopicHandle, c: ReadonlyMap<TopicHandle, number>) =>
		mainOf.get(t) === undefined || aligned(t, c) ? 0 : parentsOf.get(t)!.some((p) => c.get(p) === c.get(t)) ? STRAY.other : STRAY.none;
	const col = settle(
		columnsOf(rows, drawn, arcOf, rowOf, study),
		rows,
		(c) => {
			const { trunks, columns } = route(c);
			return trunks.cost * COST.crossing + topics.reduce((n, t) => n + stray(t.handle, c), 0) * COST.stray + columns;
		},
		aligned,
	);
	const { trunks, columns } = route(col);
	// Rows top to bottom: each chapter's header strip over its first row, each gap as deep as its lanes need.
	const starts = new Set(firstLayer);
	const depth = (gap: number) => Math.max(GAP, ((trunks.lanes.get(gap) ?? 0) + 1) * LANE);
	const tops: number[] = [];
	for (let r = 0; r < rowCount; r++) tops.push(r === 0 ? BAND_HEAD : tops[r - 1]! + H + depth(r - 1) + (starts.has(r) ? BAND_HEAD : 0));
	const laneY = (gap: number, lane: number) => tops[gap]! + H + depth(gap) / 2 + (lane - ((trunks.lanes.get(gap) ?? 1) - 1) / 2) * LANE;
	const lineOf = trunks.lines(laneY, (r) => tops[r]!, (r) => tops[r]! + H);
	// The drawing starts at its leftmost card or line, right of the margin.
	const left = Math.min(0, ...[...lineOf.values()].flatMap((pts) => pts.map(([x]) => x)));
	const right = Math.max(columns * PITCH - COLUMN_GAP, ...[...lineOf.values()].flatMap((pts) => pts.map(([x]) => x)));
	const margin = marginFor(shown.arcs);
	const shift = margin - left;
	const placed = new Map<TopicHandle, PlacedTopic>();
	for (const t of topics) placed.set(t.handle, { handle: t.handle, x: xOf(col.get(t.handle)!) - W / 2 + shift, y: tops[rowOf.get(t.handle)!]!, layer: rowOf.get(t.handle)! });
	const routes: Route[] = needs.map((n) => ({ prerequisite: n.prerequisite, topic: n.topic, points: (lineOf.get(`${n.prerequisite}>${n.topic}`) ?? []).map(([x, y]) => [x + shift, y] as const) }));
	const height = tops[rowCount - 1]! + H;
	// A chapter starts at the hairline over its first row, so the room above its cards is its own.
	const bandTops = shown.arcs.map((_, i) => tops[firstLayer[i]!]! - BAND_HEAD);
	/** Where the drawn lines cross a height: their vertical runs over it. */
	const crossingsAt = (y: number) =>
		routes.flatMap((r) =>
			r.points.slice(1).flatMap(([x, y1], k) => {
				const [x0, y0] = r.points[k]!;
				return x0 === x && Math.min(y0, y1) < y && Math.max(y0, y1) > y ? [x] : [];
			}),
		);
	const bands: Band[] = shown.arcs.map((arc, i) => ({
		arc,
		number: i + 1,
		top: bandTops[i]!,
		bottom: i + 1 < bandTops.length ? bandTops[i + 1]! : height,
		topics: topics.filter((t) => arcOf.get(t.handle) === arc.handle).map((t) => t.handle),
		here: arc.handle === shown.current,
		crossings: [...new Set(crossingsAt(bandTops[i]!))],
	}));
	const layers = rows.map((row) => [...row].sort((p, q) => col.get(p)! - col.get(q)!));
	return { layout: { node: CANVAS_NODE, width: right - left + margin, height, topics: placed, routes, layers }, bands, margin };
}

/** Bands, or Canvas tree for a course whose arcs cannot be drawn in order. */
export function layoutBandsOrTree(topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[], top: ReadonlySet<TopicHandle> | undefined, shown: ArcsShown | undefined) {
	const bands = shown ? layoutBands(topics, edges, shown) : null;
	return bands ?? { layout: layoutCanvas(topics, edges, top), bands: [] as Band[], margin: 0 };
}
