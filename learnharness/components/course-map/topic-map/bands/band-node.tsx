"use client";

import { useStore, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useCanvas } from "../canvas/canvas-context";
import { ArcMark } from "../arcs/arc-mark";
import type { Band } from "./bands-layout";

export type BandFlowNode = Node<{ band: Band; share: number | null; margin: number }, "arcBand">;

/** How far in from the frame's left edge a chapter's name stays while its margin is out of view. */
const STICK_IN = 24;

/**
 * One chapter of the course (bands.md): a hairline across the drawing over
 * every chapter but the first, and its number and pill on the line of its
 * first cards, in the margin, or held at the frame's left edge while the
 * margin is out of view, as a sticky section header is, so every chapter
 * on screen is named.
 */
export function BandNode({ data }: NodeProps<BandFlowNode>) {
	const { band, share, margin } = data;
	const focus = useCanvas()?.focus ?? null;
	const lit = focus !== null && band.topics.includes(focus.topic);
	// The frame's left edge in the drawing's units: the label slides to it, never left of the margin's start.
	const left = useStore((s) => Math.max(0, -s.transform[0] / s.transform[2] + STICK_IN / s.transform[2]));
	return (
		<div data-slot="arc-band" data-arc={band.arc.handle} data-here={band.here || undefined} className={cn("size-full", band.number > 1 && "border-t", lit ? "border-white/20" : "border-white/10")}>
			<div
				data-slot="arc-band-label"
				className={cn("absolute flex h-6 items-center rounded-full", left > 0 && "bg-background pr-1")}
				style={{ left, top: band.number > 1 ? 32 + 22 : 22, maxWidth: margin - 32 }}
			>
				<ArcMark number={band.number} handle={band.arc.handle} title={band.arc.title} share={share} />
			</div>
		</div>
	);
}
