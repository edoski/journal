"use client";

import type { Edge, EdgeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { orthogonalPath } from "../canvas/canvas-layout";
import { useCanvas } from "../canvas/canvas-context";
import type { ArcLink } from "./arc-layout";

export type ArcLinkFlowEdge = Edge<{ link: ArcLink }, "arcLink">;

/**
 * The needs from one arc to another as one line (arcs.md, Regions): out of
 * the earlier arc's bottom centre, into the later arc's top centre, in the
 * canvas's grammar. It rises while a topic in focus needs, or is needed
 * across it.
 */
export function ArcLinkEdge({ data }: EdgeProps<ArcLinkFlowEdge>) {
	const focus = useCanvas()?.focus ?? null;
	const link = data?.link;
	const on = focus !== null && link !== undefined && link.needs.some((key) => key.split(">").includes(focus.topic));
	return (
		<path
			data-slot="arc-link"
			d={orthogonalPath(link?.points ?? [])}
			fill="none"
			strokeWidth={on ? 2 : 1.5}
			strokeLinejoin="round"
			className={cn("transition-[stroke,opacity] duration-150 motion-reduce:transition-none", on ? "stroke-white/70" : "stroke-white/40", focus && !on && "opacity-30")}
		/>
	);
}
