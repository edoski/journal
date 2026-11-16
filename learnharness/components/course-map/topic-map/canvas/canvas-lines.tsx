"use client";

import { useContext } from "react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { TopicHandle } from "@/src/core";
import { TopicMapContext } from "../topic-node";
import type { Point } from "../topic-map-layout";
import { orthogonalPath } from "./canvas-layout";
import { useCanvas } from "./canvas-context";
import { lineKey, type Focus } from "./canvas-focus";

/** One line the canvas draws: a need between two topics, or (`needs`) the
 *  line from one arc to another standing for the needs between them. */
export interface CanvasLine {
	key: string;
	points: readonly Point[];
	/** A need's two topics; unset for a line between arcs. */
	prerequisite?: TopicHandle;
	topic?: TopicHandle;
	/** For a line between arcs, the needs it stands for, `prerequisite>topic`. */
	needs?: readonly string[];
}

/** How a line reads: at rest, lit with the topic in focus or the lit
 *  chain, or receded while something else is. */
export type LineInk = "rest" | "lit" | "receded";
/** Drawn in this order, so a lit line passes over the rest. */
export const LINE_INKS: readonly LineInk[] = ["receded", "rest", "lit"];

export type CanvasLinesFlowEdge = Edge<{ lines: readonly CanvasLine[] }, "canvasLines">;

/** Each line's ink, from the topic in focus or else the lit chain. Pure. */
export function inkOf(line: CanvasLine, focus: Focus | null, chain: ReadonlySet<TopicHandle> | null): LineInk {
	if (focus) {
		const on = line.needs ? line.needs.some((key) => key.split(">").includes(focus.topic)) : focus.lines.has(lineKey(line.prerequisite!, line.topic!));
		return on ? "lit" : "receded";
	}
	if (chain) return line.prerequisite && line.topic && chain.has(line.prerequisite) && chain.has(line.topic) ? "lit" : "receded";
	return "rest";
}

/** The lines of one ink as one path: a run several lines share is stroked
 *  once, so it reads at the weight of a line alone (canvas.md, Lines). Pure. */
export function inkPaths(lines: readonly CanvasLine[], focus: Focus | null, chain: ReadonlySet<TopicHandle> | null): Map<LineInk, string> {
	const paths = new Map<LineInk, string>();
	for (const line of lines) {
		if (line.points.length === 0) continue;
		const ink = inkOf(line, focus, chain);
		const d = orthogonalPath(line.points);
		paths.set(ink, paths.has(ink) ? `${paths.get(ink)} ${d}` : d);
	}
	return paths;
}

const STROKE: Record<LineInk, string> = { rest: "stroke-map-line", lit: "stroke-map-line-lit", receded: "stroke-map-line-receded" };

/**
 * Every line of the canvas (canvas.md, Lines), drawn as one React Flow
 * edge: one path per ink, each an opaque ink at one width, so where needs
 * share a bracket or a lane the track never reads thicker or brighter
 * (Edo, 16 Nov 2026: "multiple edges running in same path… makes that
 * tract look thicker which is inconsistent"). Translucent strokes, one per
 * need, added up where they overlapped, and so did their anti-aliased rims.
 */
export function CanvasLinesEdge({ data }: EdgeProps<CanvasLinesFlowEdge>) {
	const focus = useCanvas()?.focus ?? null;
	const chain = useContext(TopicMapContext)?.lit ?? null;
	const paths = inkPaths(data?.lines ?? [], focus, chain);
	return (
		<g data-slot="course-map-lines">
			{LINE_INKS.flatMap((ink) => {
				const d = paths.get(ink);
				return d ? [<path key={ink} data-slot="course-map-line" data-ink={ink} d={d} fill="none" strokeWidth={1} strokeLinejoin="round" className={STROKE[ink]} />] : [];
			})}
		</g>
	);
}

/** The canvas's lines as the one edge that draws them, tied to the first
 *  line's topics (React Flow draws an edge between two nodes); none when
 *  nothing is drawn. */
export function linesEdge(lines: readonly CanvasLine[], ends: { source: string; target: string } | null): CanvasLinesFlowEdge[] {
	const drawn = lines.filter((line) => line.points.length > 0);
	if (drawn.length === 0 || !ends) return [];
	return [{ id: "lines", ...ends, type: "canvasLines", data: { lines: drawn }, focusable: false, selectable: false, domAttributes: { "aria-hidden": true } }];
}
