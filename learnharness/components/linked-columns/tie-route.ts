/**
 * The connector's route (spec: linked-columns.md, "The connector"): one
 * smooth curve from the selected row, across the gutter, to its node's
 * near edge. It leaves the row's vertical centre heading right, arrives
 * square to the edge it meets, never runs along the gutter, never turns
 * back towards the list and never passes through another node. Pure, in
 * the layout's own pixels.
 */

export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface Point {
	x: number;
	y: number;
}

/** What the route is drawn between, measured in the layout's pixels. */
export interface TieGeometry {
	/** The row's right edge at its vertical centre. */
	from: Point;
	/** The node the row is tied to. */
	to: Box;
	/** What the curve must keep clear of: every other node in view, and the
	 *  map's tags. */
	obstacles: readonly Box[];
	/** The band between the two columns: the list's right edge and the
	 *  map's left edge. */
	gutter: { left: number; right: number };
}

/** Which edge of the node the route meets. */
export type Side = "left" | "top" | "bottom";

export interface TieRoute {
	/** An SVG path: `M`, then one cubic `C`. */
	d: string;
	side: Side;
	/** Where it meets the node. */
	end: Point;
	/** False when no curve keeps every rule; the route then crosses the
	 *  fewest nodes, and the map's nodes paint over it. */
	clear: boolean;
}

/** How far the curve keeps from a node it passes. */
export const CLEARANCE = 6;
/** How much the curve may climb or fall while it is in the gutter, or
 *  near it: up to 16px into the list or 32px into the map past it. Enough
 *  to curve out of the row, never a run along a column's edge. */
export const GUTTER_RUN = 12;
export const GUTTER_REACH = { list: 16, map: 32 };
/** How far a top or bottom arrival keeps from the edge's middle, where the
 *  map's own need lines meet the node. */
const NEED_CLEAR = 20;
/** How much longer a route into the top or bottom may be before the left
 *  edge, the nearer one, is given up for it. */
const SIDE_COST = 48;
const SAMPLES = 48;
/** The handle lengths tried, as shares of the distance each handle spans:
 *  short ones turn tightly, long ones sweep. */
const HANDLES = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 1];

type Cubic = readonly [Point, Point, Point, Point];

/** The point at `t` along a cubic. Pure. */
export function cubicAt([p0, p1, p2, p3]: Cubic, t: number): Point {
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const c = 3 * u * t * t;
	const d = t * t * t;
	return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Points along a cubic, the ends included. */
export function sampleCubic(curve: Cubic, count = SAMPLES): Point[] {
	return Array.from({ length: count + 1 }, (_, i) => cubicAt(curve, i / count));
}

const round = (n: number) => Math.round(n * 10) / 10;

/** A cubic as an SVG path. */
export function cubicPath([p0, p1, p2, p3]: Cubic): string {
	return `M ${round(p0.x)} ${round(p0.y)} C ${round(p1.x)} ${round(p1.y)}, ${round(p2.x)} ${round(p2.y)}, ${round(p3.x)} ${round(p3.y)}`;
}

/** Whether the segment from `a` to `b` passes through `box` (Liang–Barsky). */
export function segmentHits(a: Point, b: Point, box: Box): boolean {
	let t0 = 0;
	let t1 = 1;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const edges: [number, number][] = [
		[-dx, a.x - box.left],
		[dx, box.right - a.x],
		[-dy, a.y - box.top],
		[dy, box.bottom - a.y],
	];
	for (const [p, q] of edges) {
		if (p === 0) {
			if (q < 0) return false;
			continue;
		}
		const r = q / p;
		if (p < 0) {
			if (r > t1) return false;
			if (r > t0) t0 = r;
		} else {
			if (r < t0) return false;
			if (r < t1) t1 = r;
		}
	}
	return t0 <= t1;
}

const grow = (box: Box, by: number): Box => ({ left: box.left - by, top: box.top - by, right: box.right + by, bottom: box.bottom + by });

/** How many of the boxes a polyline passes through. */
function hits(points: readonly Point[], boxes: readonly Box[]): number {
	let count = 0;
	for (const box of boxes) {
		for (let i = 1; i < points.length; i++) {
			if (segmentHits(points[i - 1]!, points[i]!, box)) {
				count++;
				break;
			}
		}
	}
	return count;
}

/** How far a polyline climbs or falls inside the gutter, or near it
 *  (`GUTTER_REACH`). Pure. */
export function gutterRun(points: readonly Point[], gutter: TieGeometry["gutter"]): number {
	const within = (p: Point) => p.x >= gutter.left - GUTTER_REACH.list && p.x <= gutter.right + GUTTER_REACH.map;
	// A sample either side of the band's edge counts too, so a coarse sampling never hides a climb.
	const inside = points.filter((p, i) => within(p) || (i > 0 && within(points[i - 1]!)));
	if (inside.length === 0) return 0;
	const ys = inside.map((p) => p.y);
	return Math.max(...ys) - Math.min(...ys);
}

const length = (points: readonly Point[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);

/** Every curve worth trying: into the left edge's middle, square to it, as
 *  an S across the gutter; and into the top (or bottom) edge from the side
 *  the row is on, square to it, at points either side of its middle. Each
 *  with a few handle lengths, from a gentle sweep to one rounded elbow. */
function candidates({ from, to }: TieGeometry): { side: Side; curve: Cubic }[] {
	const out: { side: Side; curve: Cubic }[] = [];
	const cy = (to.top + to.bottom) / 2;
	const dx = to.left - from.x;
	if (dx > 0) {
		for (const a of HANDLES) {
			for (const b of HANDLES) {
				out.push({ side: "left", curve: [from, { x: from.x + a * dx, y: from.y }, { x: to.left - b * dx, y: cy }, { x: to.left, y: cy }] });
			}
		}
	}
	const width = to.right - to.left;
	const middle = (to.left + to.right) / 2;
	const xs = [0.12, 0.25, 0.75, 0.88].map((f) => to.left + f * width).filter((x) => Math.abs(x - middle) >= NEED_CLEAR);
	for (const side of ["top", "bottom"] as const) {
		const y = side === "top" ? to.top : to.bottom;
		const dy = y - from.y;
		if (side === "top" ? dy <= 0 : dy >= 0) continue;
		for (const x of xs) {
			const run = x - from.x;
			if (run <= 0) continue;
			for (const a of HANDLES) {
				for (const b of HANDLES) {
					out.push({ side, curve: [from, { x: from.x + a * run, y: from.y }, { x, y: y - b * dy }, { x, y }] });
				}
			}
		}
	}
	return out;
}

/** Whether a polyline passes through any of the boxes, the boxes outside
 *  its bounds skipped. */
function crosses(points: readonly Point[], boxes: readonly Box[]): boolean {
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
	return boxes.some(
		(box) => box.right >= bounds.left && box.left <= bounds.right && box.bottom >= bounds.top && box.top <= bounds.bottom && points.some((p, i) => i > 0 && segmentHits(points[i - 1]!, p, box)),
	);
}

/**
 * The connector's route from the row to its node: of every candidate
 * curve, the shortest that keeps all the rules, the left edge preferred
 * unless the top or bottom is much shorter. Rules: it never passes within
 * `CLEARANCE` of another node, nor through its own node before it arrives;
 * it never climbs or falls more than `GUTTER_RUN` in the gutter; it never
 * turns back towards the list. When none keeps them all, the one that
 * crosses the fewest nodes, marked not clear. Null when the node sits
 * behind the row (nothing to the right of it). Pure.
 */
export function routeTie(geometry: TieGeometry): TieRoute | null {
	const { to, obstacles, gutter } = geometry;
	const walls = obstacles.map((box) => grow(box, CLEARANCE));
	const tried = candidates(geometry)
		.map(({ side, curve }) => {
			const points = sampleCubic(curve);
			return { side, curve, points, cost: length(points) + (side === "left" ? 0 : SIDE_COST) };
		})
		.filter(({ points }) => points.every((p, i) => i === 0 || p.x >= points[i - 1]!.x - 0.01))
		.sort((a, b) => a.cost - b.cost);
	const route = ({ side, curve }: (typeof tried)[number], clear: boolean): TieRoute => ({ d: cubicPath(curve), side, end: curve[3], clear });
	// The last few samples meet the node; before them the curve must not pass through it.
	const clear = tried.find(({ points }) => gutterRun(points, gutter) <= GUTTER_RUN && !crosses(points.slice(0, -3), [to]) && !crosses(points, walls));
	if (clear) return route(clear, true);
	let fallback: { at: (typeof tried)[number]; score: number } | null = null;
	for (const at of tried) {
		const score = (hits(at.points, walls) + hits(at.points.slice(0, -3), [to])) * 10_000 + Math.max(0, gutterRun(at.points, gutter) - GUTTER_RUN) * 10 + at.cost;
		if (!fallback || score < fallback.score) fallback = { at, score };
	}
	return fallback ? route(fallback.at, false) : null;
}

/** Where the row may sit beside its node: level with its middle, or in the
 *  channel between layers just above or just below it, clear of the tags
 *  that sit 20px over a node. */
const ABOVE = 38;
const BELOW = 18;

/**
 * How far the map could move its drawing up or down so the row sits beside
 * its node, the smallest first and not moving at all before them: level
 * with the node's middle (a gentle S into its left edge), or in the
 * channel just above or below it (a sweep along the channel, then into its
 * top or bottom edge). Pure.
 */
export function tieShifts(from: Point, to: Box): number[] {
	const shifts = [from.y - (to.top + to.bottom) / 2, from.y + ABOVE - to.top, from.y - BELOW - to.bottom];
	return [0, ...shifts.sort((a, b) => Math.abs(a) - Math.abs(b))];
}

const shift = (box: Box, dy: number): Box => ({ ...box, top: box.top + dy, bottom: box.bottom + dy });

/** Of the vertical shifts given, in order, the first that gives the tie a
 *  clear route once the map's drawing (the node and every obstacle) has
 *  moved by it; null when none does. Pure. */
export function clearShift(geometry: TieGeometry, shifts: readonly number[]): number | null {
	for (const dy of shifts) {
		const moved = { ...geometry, to: shift(geometry.to, dy), obstacles: geometry.obstacles.map((box) => shift(box, dy)) };
		if (routeTie(moved)?.clear) return dy;
	}
	return null;
}
