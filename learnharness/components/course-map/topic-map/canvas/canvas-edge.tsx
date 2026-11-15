"use client";

import { useContext } from "react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { TopicHandle } from "@/src/core";
import { cn } from "@/lib/utils";
import type { Point } from "../topic-map-layout";
import { TopicMapContext } from "../topic-node";
import { orthogonalPath } from "./canvas-layout";
import { useCanvas } from "./canvas-context";
import { lineKey } from "./canvas-focus";

export type CanvasFlowEdge = Edge<{ points: readonly Point[] }, "canvasNeed">;

/**
 * One need on the canvas (canvas.md, Lines): an orthogonal line with
 * rounded corners from the prerequisite's bottom edge down to its port on
 * the topic's top edge, quiet at rest (Linear: structure felt, not seen). While a chain is lit,
 * its lines rise and the others all but go; while a topic is in focus, the
 * lines to what it needs and leads to rise (canvas.md, Focus).
 */
export function CanvasEdge({ source, target, data }: EdgeProps<CanvasFlowEdge>) {
	const focus = useCanvas()?.focus ?? null;
	const chain = useContext(TopicMapContext)?.lit ?? null;
	const on = focus ? focus.lines.has(lineKey(source as TopicHandle, target as TopicHandle)) : chain !== null && chain.has(source as TopicHandle) && chain.has(target as TopicHandle);
	const lit = focus ?? chain;
	return (
		<path
			data-slot="course-map-need"
			d={orthogonalPath(data?.points ?? [])}
			fill="none"
			strokeWidth={on ? 1.5 : 1}
			strokeLinejoin="round"
			className={cn("transition-[stroke,opacity] duration-150 motion-reduce:transition-none", on ? "stroke-white/70" : "stroke-white/33", lit && !on && "opacity-30")}
		/>
	);
}
