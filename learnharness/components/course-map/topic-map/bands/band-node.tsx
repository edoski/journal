"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { useFrameLeft } from "../frame-left";
import { cn } from "@/lib/utils";
import { useCanvas } from "../canvas/canvas-context";
import { ArcLabel } from "../arcs/arc-label";
import { ruleStretches, type Band } from "./bands-layout";

export type BandFlowNode = Node<{ band: Band; share: number | null; margin: number }, "arcBand">;

/** How far in from the frame's left edge a chapter's name stays while its margin is out of view. */
/** Clear of the map's edge fade (Home's vignette is 64 across). */
const STICK_IN = 64;

/**
 * One chapter of the course (bands.md): a hairline across the drawing over
 * every chapter but the first, stopping short of every line that crosses it
 * (`ruleStretches`), so no rule meets a line (Edo, 16 Nov 2026: "the band
 * lines overlap with the edges visually and it just makes it confusing");
 * and its number and name, quiet (`ArcLabel`), in its header strip, in the
 * margin, or held at the frame's left edge while the margin is out of view,
 * as a sticky section header is. The strip holds no card, so the name
 * never covers one; a line passing through runs under it.
 */
export function BandNode({ data, width }: NodeProps<BandFlowNode>) {
	const { band, margin } = data;
	const focus = useCanvas()?.focus ?? null;
	const lit = focus !== null && band.topics.includes(focus.topic);
	// The frame's left edge in the drawing's units: the label slides to it, never left of the margin's start.
	const left = Math.max(0, useFrameLeft(STICK_IN));
	return (
		<div data-slot="arc-band" data-arc={band.arc.handle} data-here={band.here || undefined} className="relative size-full">
			{band.number > 1 &&
				ruleStretches(0, width ?? 0, band.crossings).map(([from, to]) => (
					<span key={from} data-slot="arc-band-rule" className={cn("absolute top-0 h-px", lit ? "bg-white/20" : "bg-white/10")} style={{ left: from, width: to - from }} />
				))}
			<div data-slot="arc-band-label" className="absolute flex h-6 items-center bg-background pr-2" style={{ left: 0, top: 8, maxWidth: margin - 32, transform: `translateX(${left}px)` }}>
				<ArcLabel number={band.number} handle={band.arc.handle} title={band.arc.title} here={band.here} />
			</div>
		</div>
	);
}
