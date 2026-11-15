"use client";

import { useContext } from "react";
import type { Edge, EdgeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { routePath, type Point } from "./topic-map-layout";
import { TopicMapContext } from "./topic-node";

/** A need between two topics, carrying the route the layout gave it. */
export type NeedFlowEdge = Edge<{ points: readonly Point[] }, "need">;

/**
 * One need on the map: a quiet line down from the prerequisite to the
 * topic that needs it, along the layout's own route. It brightens while
 * both its ends are in the lit chain and fades while another chain is lit.
 */
export function NeedEdge({ source, target, data }: EdgeProps<NeedFlowEdge>) {
	const lit = useContext(TopicMapContext)?.lit ?? null;
	const on = lit !== null && lit.has(source as never) && lit.has(target as never);
	return (
		<path
			data-slot="course-map-need"
			d={routePath(data?.points ?? [])}
			fill="none"
			strokeWidth={1}
			strokeLinecap="round"
			className={cn("transition-[stroke,opacity] duration-[120ms] motion-reduce:transition-none", on ? "stroke-white/70" : "stroke-white/33", lit && !on && "opacity-35")}
		/>
	);
}
