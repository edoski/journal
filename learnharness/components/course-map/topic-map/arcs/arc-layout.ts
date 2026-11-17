/**
 * A course's arcs as regions (arcs.md): each arc laid out alone in the
 * canvas's grammar, as Graphviz lays out a cluster with `clusterrank=local`,
 * then the arcs themselves laid out as boxes in the same grammar, so the
 * needs that leave an arc go out through its one port, its bottom centre,
 * and reach the next arc at its top centre. An arc may be folded to one
 * card. Pure.
 */

import type { ArcHandle, CourseMap, CourseMapArc, CourseMapEdge, CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";
import { arcShare } from "@/components/course-page/course-model";
import type { PlacedTopic, Point, Route, TopicMapLayout } from "../topic-map-layout";
import type { ArcsShown } from "../map-skin";
import { CANVAS_NODE, layeredDrawing, transitiveReduction, type LayeredDrawing, type Need } from "../canvas/canvas-layout";

/** An open region's room around its cards: its header (the arc's number and pill, and room for "You are here"
 *  above a card in its first layer), and the sides and foot, a lane wide. */
export const REGION = { padX: 24, head: 72, padBottom: 24 } as const;
/** A folded arc: its number, ring and name on up to two lines, and how many topics it holds. */
export const ARC_CARD = { width: 264, height: 72 } as const;
/** Between two regions side by side: twice a region's padding, so the space between them reads as a boundary too. */
const REGION_GAP = 48;

/** One arc as drawn: a region holding its topics, or folded to a card. */
export interface ArcRegion {
	arc: CourseMapArc;
	/** Its place in study order, from 1. */
	number: number;
	x: number;
	y: number;
	width: number;
	height: number;
	open: boolean;
	topics: readonly TopicHandle[];
	/** It holds "You are here". */
	here: boolean;
}

/** The needs from one arc to another, drawn as one line between their ports. */
export interface ArcLink {
	from: ArcHandle;
	to: ArcHandle;
	points: readonly Point[];
	/** The needs it stands for, `prerequisite>topic`. */
	needs: readonly string[];
}

export interface ArcDrawing {
	regions: readonly ArcRegion[];
	links: readonly ArcLink[];
}

/** Each topic's arc: its own, else the arc of its first prerequisite that has one, else the first arc. */
export function arcsOfTopics(topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[], arcs: readonly CourseMapArc[]): Map<TopicHandle, ArcHandle> {
	const known = new Set(arcs.map((a) => a.handle));
	const of = new Map<TopicHandle, ArcHandle>();
	for (const t of topics) if (t.arc && known.has(t.arc)) of.set(t.handle, t.arc);
	for (const t of topics) {
		if (of.has(t.handle)) continue;
		const from = edges.find((e) => e.kind === "needs" && e.topic === t.handle && of.has(e.prerequisite));
		of.set(t.handle, from?.kind === "needs" ? of.get(from.prerequisite)! : arcs[0]!.handle);
	}
	return of;
}

/** Positions of topic cards placed in a drawing, offset by `dx, dy`. */
function placeTopics(inner: LayeredDrawing, dx: number, dy: number, into: Map<TopicHandle, PlacedTopic>, lines: Map<string, Point[]>) {
	for (const [id, box] of inner.boxes) into.set(id as TopicHandle, { handle: id as TopicHandle, x: box.x + dx, y: box.y + dy, layer: 0 });
	for (const [key, points] of inner.lines) lines.set(key, points.map(([x, y]) => [x + dx, y + dy] as const));
}

/** The topics' rows, top to bottom, each left to right: the arrows walk them (`neighbourOf`). */
export function rowsOf(placed: Map<TopicHandle, PlacedTopic>): TopicHandle[][] {
	const ys = [...new Set([...placed.values()].map((p) => p.y))].sort((a, b) => a - b);
	const rows = ys.map((y) => [...placed.values()].filter((p) => p.y === y).sort((a, b) => a.x - b.x));
	rows.forEach((row, layer) => row.forEach((p) => placed.set(p.handle, { ...p, layer })));
	return rows.map((row) => row.map((p) => p.handle));
}

/**
 * The course as arc regions: each open arc's topics laid out alone with
 * the needs between them (no longer chain implied), in a region with a
 * header; each folded arc a card; and the arcs laid out as boxes, the needs
 * from one arc to another drawn as one line between them (no longer chain
 * of arcs implied). Topics of a folded arc are not placed, nor are the
 * needs that touch them routed. A need between arcs keeps no line of its
 * own: the arcs' line is its line.
 */
export function layoutArcRegions(topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[], shown: ArcsShown): { layout: TopicMapLayout; drawing: ArcDrawing } {
	const needs = edges.filter((e): e is Need => e.kind === "needs");
	const arcOf = arcsOfTopics(topics, edges, shown.arcs);
	const inside = new Map<ArcHandle, LayeredDrawing>();
	const sizes = shown.arcs.map((arc) => {
		const own = topics.filter((t) => arcOf.get(t.handle) === arc.handle);
		if (!shown.open.has(arc.handle) || own.length === 0) return { id: arc.handle as string, ...ARC_CARD };
		const ownNeeds = needs.filter((n) => arcOf.get(n.prerequisite) === arc.handle && arcOf.get(n.topic) === arc.handle);
		const drawing = layeredDrawing(
			own.map((t) => ({ id: t.handle, ...CANVAS_NODE })),
			transitiveReduction(ownNeeds).map((n) => ({ source: n.prerequisite, target: n.topic })),
		);
		inside.set(arc.handle, drawing);
		return { id: arc.handle as string, width: Math.max(ARC_CARD.width, drawing.width + 2 * REGION.padX), height: REGION.head + drawing.height + REGION.padBottom };
	});
	const between = new Map<string, string[]>();
	for (const n of needs) {
		const from = arcOf.get(n.prerequisite)!;
		const to = arcOf.get(n.topic)!;
		if (from === to) continue;
		const key = `${from}>${to}`;
		between.set(key, [...(between.get(key) ?? []), `${n.prerequisite}>${n.topic}`]);
	}
	const arcNeeds = [...between.keys()].map((key) => {
		const [from, to] = key.split(">") as [TopicHandle, TopicHandle];
		return { kind: "needs" as const, prerequisite: from, topic: to };
	});
	const outer = layeredDrawing(
		sizes,
		transitiveReduction(arcNeeds).map((n) => ({ source: n.prerequisite as string, target: n.topic as string })),
		{ nodeGap: REGION_GAP, order: (id) => shown.arcs.findIndex((a) => a.handle === id) },
	);

	const placed = new Map<TopicHandle, PlacedTopic>();
	const lines = new Map<string, Point[]>();
	const here = shown.current;
	const regions: ArcRegion[] = shown.arcs.map((arc, i) => {
		const box = outer.boxes.get(arc.handle)!;
		const drawing = inside.get(arc.handle);
		if (drawing) placeTopics(drawing, box.x + (box.width - drawing.width) / 2, box.y + REGION.head, placed, lines);
		return {
			arc,
			number: i + 1,
			x: box.x,
			y: box.y,
			width: box.width,
			height: box.height,
			open: drawing !== undefined,
			topics: topics.filter((t) => arcOf.get(t.handle) === arc.handle).map((t) => t.handle),
			here: arc.handle === here,
		};
	});
	const links: ArcLink[] = [...outer.lines].map(([key, points]) => {
		const [from, to] = key.split(">") as [ArcHandle, ArcHandle];
		return { from, to, points, needs: between.get(key) ?? [] };
	});
	const routes: Route[] = needs.filter((n) => placed.has(n.prerequisite) && placed.has(n.topic)).map((n) => ({ prerequisite: n.prerequisite, topic: n.topic, points: lines.get(`${n.prerequisite}>${n.topic}`) ?? [] }));
	const layers = rowsOf(placed);
	return { layout: { node: CANVAS_NODE, width: outer.width, height: outer.height, topics: placed, routes, layers }, drawing: { regions, links } };
}

/** An arc's ring, as the strip's pill draws it (`arcShare`): the share of its live topics he can do on his own. */
export function arcRing(map: CourseMap, arc: ArcHandle): number | null {
	return arcShare({ map } as Pick<StudyCourse, "map"> as StudyCourse, arc);
}
