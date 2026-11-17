"use client";

import { useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { useStore, type Edge, type EdgeProps } from "@xyflow/react";
import type { TopicHandle } from "@/src/core";
import { TopicMapContext } from "../topic-node";
import type { Point } from "../topic-map-layout";
import { CORNER } from "./canvas-layout";
import { useCanvas } from "./canvas-context";
import { lineKey, type Focus } from "./canvas-focus";

/** One line the canvas draws: a need between two topics. */
export interface CanvasLine {
	key: string;
	points: readonly Point[];
	prerequisite: TopicHandle;
	topic: TopicHandle;
}

/** How a line reads: at rest, lit with the topic in focus or the lit
 *  chain, or receded while something else is. */
export type LineInk = "rest" | "lit" | "receded";
/** Drawn in this order, so a lit line passes over the rest. */
export const LINE_INKS: readonly LineInk[] = ["receded", "rest", "lit"];
/** Which ink a stretch several lines share takes: the brightest of theirs. */
const RANK: Record<LineInk, number> = { receded: 0, rest: 1, lit: 2 };

export type CanvasLinesFlowEdge = Edge<{ lines: readonly CanvasLine[] }, "canvasLines">;

/** Each line's ink, from the topic in focus or else the lit chain. Pure. */
export function inkOf(line: CanvasLine, focus: Focus | null, chain: ReadonlySet<TopicHandle> | null): LineInk {
	if (focus) {
		return focus.lines.has(lineKey(line.prerequisite, line.topic)) ? "lit" : "receded";
	}
	if (chain) return chain.has(line.prerequisite) && chain.has(line.topic) ? "lit" : "receded";
	return "rest";
}

/** A stretch of a line: a straight run along one axis, a rounded corner, or (a line that is not orthogonal) a plain segment. */
export type Piece =
	| { kind: "run"; vertical: boolean; at: number; from: number; to: number }
	| { kind: "corner"; a: Point; at: Point; b: Point }
	| { kind: "segment"; a: Point; b: Point };

/** A line's corners as its pieces: straight runs between the corners, each corner rounded by up to `CORNER` and never
 *  past half of either run beside it, as every canvas line bends. Pure. */
export function piecesOf(points: readonly Point[]): Piece[] {
	const n = points.length;
	const len = (i: number) => Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
	const bend = points.map((_, i) => {
		if (i === 0 || i === n - 1) return 0;
		const k = Math.min(CORNER, len(i - 1) / 2, len(i) / 2);
		return k < 0.5 ? 0 : k;
	});
	/** `from` moved `by` towards `to`. */
	const toward = (from: Point, to: Point, by: number): Point => {
		const l = Math.hypot(to[0] - from[0], to[1] - from[1]);
		return l === 0 ? from : [from[0] + ((to[0] - from[0]) / l) * by, from[1] + ((to[1] - from[1]) / l) * by];
	};
	const pieces: Piece[] = [];
	for (let i = 0; i + 1 < n; i++) {
		const a = toward(points[i]!, points[i + 1]!, bend[i]!);
		const b = toward(points[i + 1]!, points[i]!, bend[i + 1]!);
		if (a[0] === b[0] && a[1] === b[1]) continue;
		if (a[0] === b[0]) pieces.push({ kind: "run", vertical: true, at: a[0], from: Math.min(a[1], b[1]), to: Math.max(a[1], b[1]) });
		else if (a[1] === b[1]) pieces.push({ kind: "run", vertical: false, at: a[1], from: Math.min(a[0], b[0]), to: Math.max(a[0], b[0]) });
		else pieces.push({ kind: "segment", a, b });
	}
	for (let i = 1; i + 1 < n; i++) {
		if (bend[i] === 0) continue;
		pieces.push({ kind: "corner", a: toward(points[i]!, points[i - 1]!, bend[i]!), at: points[i]!, b: toward(points[i]!, points[i + 1]!, bend[i]!) });
	}
	return pieces;
}

const key3 = (v: number) => v.toFixed(3);
const pointKey = (p: Point) => `${key3(p[0])},${key3(p[1])}`;

/**
 * Every stretch of track drawn once (canvas.md, Lines): the lines' pieces,
 * where several lines run along the same stretch, merged into one, in the
 * brightest ink among them, so no stretch is ever painted twice in two inks
 * (a receded line under a lit one widened its rim). Pure.
 */
export function trackPieces(lines: readonly CanvasLine[], focus: Focus | null, chain: ReadonlySet<TopicHandle> | null): Map<LineInk, Piece[]> {
	const runs = new Map<string, { vertical: boolean; at: number; spans: { from: number; to: number; ink: LineInk }[] }>();
	const others = new Map<string, { piece: Piece; ink: LineInk }>();
	for (const line of lines) {
		if (line.points.length === 0) continue;
		const ink = inkOf(line, focus, chain);
		for (const piece of piecesOf(line.points)) {
			if (piece.kind === "run") {
				const k = `${piece.vertical ? "v" : "h"}:${key3(piece.at)}`;
				const group = runs.get(k) ?? { vertical: piece.vertical, at: piece.at, spans: [] };
				group.spans.push({ from: piece.from, to: piece.to, ink });
				runs.set(k, group);
				continue;
			}
			const k = piece.kind === "corner" ? `c:${pointKey(piece.a)}:${pointKey(piece.at)}:${pointKey(piece.b)}` : `s:${pointKey(piece.a)}:${pointKey(piece.b)}`;
			const known = others.get(k);
			if (!known || RANK[ink] > RANK[known.ink]) others.set(k, { piece, ink });
		}
	}
	const out = new Map<LineInk, Piece[]>();
	const add = (ink: LineInk, piece: Piece) => out.set(ink, [...(out.get(ink) ?? []), piece]);
	for (const { vertical, at, spans } of runs.values()) {
		const cuts = [...new Set(spans.flatMap((s) => [s.from, s.to]))].sort((x, y) => x - y);
		let open = null as { from: number; to: number; ink: LineInk } | null;
		for (let i = 0; i + 1 < cuts.length; i++) {
			const mid = (cuts[i]! + cuts[i + 1]!) / 2;
			const over = spans.filter((s) => s.from <= mid && s.to >= mid);
			const ink = over.length ? over.reduce((best, s) => (RANK[s.ink] > RANK[best] ? s.ink : best), over[0]!.ink) : null;
			if (open && (ink !== open.ink || open.to !== cuts[i])) {
				add(open.ink, { kind: "run", vertical, at, from: open.from, to: open.to });
				open = null;
			}
			if (!ink) continue;
			if (open) open.to = cuts[i + 1]!;
			else open = { from: cuts[i]!, to: cuts[i + 1]!, ink };
		}
		if (open) add(open.ink, { kind: "run", vertical, at, from: open.from, to: open.to });
	}
	for (const { piece, ink } of others.values()) add(ink, piece);
	return out;
}

/** Moves a drawing coordinate onto the screen's device pixels (`snapTo`); none on a server render. */
export type Snap = ((value: number, axis: "x" | "y") => number) | null;

/**
 * Where a line 1 screen pixel wide must sit to fill whole device pixels,
 * the drawing's origin at `[x, y]` on the screen and `zoom` its scale (its
 * screen matrix, so the frame's own place on the page counts), on a screen
 * of `dpr`: its centre on a device
 * pixel's edge when the line covers an even number of them (a 2x screen),
 * else on a pixel's middle. A line off the grid spreads over one more pixel
 * at a lower grey, so two lines read two weights. Pure.
 */
export function snapTo([x, y, zoom]: readonly [number, number, number], dpr: number): NonNullable<Snap> {
	const offset = Math.round(dpr) % 2 === 1 ? 0.5 : 0;
	return (value, axis) => {
		const shift = axis === "x" ? x : y;
		const device = (value * zoom + shift) * dpr;
		return ((Math.round(device - offset) + offset) / dpr - shift) / zoom;
	};
}

/** One ink's pieces as an SVG path, each coordinate snapped. Pure. */
export function piecesPath(pieces: readonly Piece[], snap: Snap): string {
	const sx = (v: number) => (snap ? snap(v, "x") : v);
	const sy = (v: number) => (snap ? snap(v, "y") : v);
	const pt = (p: Point) => `${sx(p[0])},${sy(p[1])}`;
	return pieces
		.map((p) => {
			if (p.kind === "run") return p.vertical ? `M${sx(p.at)},${sy(p.from)} L${sx(p.at)},${sy(p.to)}` : `M${sx(p.from)},${sy(p.at)} L${sx(p.to)},${sy(p.at)}`;
			if (p.kind === "corner") return `M${pt(p.a)} Q${pt(p.at)} ${pt(p.b)}`;
			return `M${pt(p.a)} L${pt(p.b)}`;
		})
		.join(" ");
}

/** Each ink's track as one path (`trackPieces`, `piecesPath`). Pure. */
export function inkPaths(lines: readonly CanvasLine[], focus: Focus | null, chain: ReadonlySet<TopicHandle> | null, snap: Snap = null): Map<LineInk, string> {
	const paths = new Map<LineInk, string>();
	for (const [ink, pieces] of trackPieces(lines, focus, chain)) paths.set(ink, piecesPath(pieces, snap));
	return paths;
}

const STROKE: Record<LineInk, string> = { rest: "stroke-map-line", lit: "stroke-map-line-lit", receded: "stroke-map-line-receded" };

/** The screen's device pixels per CSS pixel; 0 on a server render, which draws unsnapped. */
function subscribeDpr(onChange: () => void): () => void {
	let query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
	const changed = () => {
		query.removeEventListener("change", changed);
		query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
		query.addEventListener("change", changed);
		onChange();
	};
	query.addEventListener("change", changed);
	return () => query.removeEventListener("change", changed);
}
const readDpr = () => window.devicePixelRatio;
const serverDpr = () => 0;

/** The lines' pieces, drawn: one path per ink, each 1 screen pixel wide at the drawing's `scale` (the camera's zoom:
 *  a `vector-effect` of non-scaling-stroke leaves the frame's CSS scale in), on the device pixels. */
export function LinePaths({ pieces, snap, scale = 1, ref }: { pieces: ReadonlyMap<LineInk, readonly Piece[]>; snap: Snap; scale?: number; ref?: Ref<SVGGElement> }) {
	return (
		<g ref={ref} data-slot="course-map-lines">
			{LINE_INKS.flatMap((ink) => {
				const drawn = pieces.get(ink);
				return drawn?.length
					? [<path key={ink} data-slot="course-map-line" data-ink={ink} d={piecesPath(drawn, snap)} fill="none" strokeWidth={1 / scale} strokeLinejoin="round" className={STROKE[ink]} />]
					: [];
			})}
		</g>
	);
}

/**
 * Every line of the canvas (canvas.md, Lines), drawn as one React Flow
 * edge: each stretch of track once, in the brightest ink of the lines along
 * it (`trackPieces`), one opaque ink a path, 1 screen pixel wide whatever
 * the zoom and snapped to the screen's device pixels (`snapTo`), so a line
 * alone, a track several lines share and the arms of a junction read the
 * same width and grey (Edo, 16 Nov 2026: "a difference in the edges when
 * there's just one line versus two lines going through them, both in terms
 * of thickness and colour"). Off the pixel grid a line spread over three
 * device pixels at a lower grey; two inks on one stretch widened its rim.
 */
export function CanvasLinesEdge({ data }: EdgeProps<CanvasLinesFlowEdge>) {
	const focus = useCanvas()?.focus ?? null;
	const chain = useContext(TopicMapContext)?.lit ?? null;
	const lines = data?.lines;
	const pieces = useMemo(() => trackPieces(lines ?? [], focus, chain), [lines, focus, chain]);
	// Every camera move draws again; the drawing's screen matrix, read once it is placed, says where its pixels fall.
	useStore((s) => s.transform);
	const dpr = useSyncExternalStore(subscribeDpr, readDpr, serverDpr);
	const box = useRef<SVGGElement>(null);
	const [screen, setScreen] = useState<readonly [number, number, number] | null>(null);
	useLayoutEffect(() => {
		const m = box.current?.getScreenCTM();
		if (m && (!screen || screen[0] !== m.e || screen[1] !== m.f || screen[2] !== m.a)) setScreen([m.e, m.f, m.a]);
	});
	const snap = useMemo(() => (dpr > 0 && screen ? snapTo(screen, dpr) : null), [screen, dpr]);
	return <LinePaths ref={box} pieces={pieces} snap={snap} scale={screen?.[2] ?? 1} />;
}

/** The canvas's lines as the one edge that draws them, tied to the first
 *  line's topics (React Flow draws an edge between two nodes); none when
 *  nothing is drawn. */
export function linesEdge(lines: readonly CanvasLine[], ends: { source: string; target: string } | null): CanvasLinesFlowEdge[] {
	const drawn = lines.filter((line) => line.points.length > 0);
	if (drawn.length === 0 || !ends) return [];
	return [{ id: "lines", ...ends, type: "canvasLines", data: { lines: drawn }, focusable: false, selectable: false, domAttributes: { "aria-hidden": true } }];
}
