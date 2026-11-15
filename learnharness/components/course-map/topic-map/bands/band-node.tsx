"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useCanvas } from "../canvas/canvas-context";
import { ArcMark } from "../arcs/arc-mark";
import type { Band } from "./bands-layout";

export type BandFlowNode = Node<{ band: Band; share: number | null; margin: number }, "arcBand">;

/**
 * One chapter of the course (bands.md): a hairline across the drawing over
 * every chapter but the first, and in the margin beside its cards its
 * number and pill, on the line of its first cards.
 */
export function BandNode({ data }: NodeProps<BandFlowNode>) {
	const { band, share, margin } = data;
	const focus = useCanvas()?.focus ?? null;
	const lit = focus !== null && band.topics.includes(focus.topic);
	return (
		<div data-slot="arc-band" data-arc={band.arc.handle} data-here={band.here || undefined} className={cn("size-full", band.number > 1 && "border-t", lit ? "border-white/20" : "border-white/10")}>
			<div className="flex items-center" style={{ width: margin - 32, height: 24, marginTop: band.number > 1 ? 32 + 22 : 22 }}>
				<ArcMark number={band.number} handle={band.arc.handle} title={band.arc.title} share={share} />
			</div>
		</div>
	);
}
