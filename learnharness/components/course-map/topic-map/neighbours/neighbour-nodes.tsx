"use client";

import { useContext } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { useFrameLeft } from "../frame-left";
import type { ArcHandle, CourseMapTopic } from "@/src/core";
import { cn } from "@/lib/utils";
import { MathLine } from "@/components/ui/math-line";
import { TopicGlyph } from "../topic-glyph";
import { standingOf } from "../topic-standing";
import { TopicMapContext } from "../topic-node";
import { ArcLabel } from "../arcs/arc-label";
import { BaseNode, BaseNodeContent, BaseNodeHeader } from "../canvas/base-node";
import { CANVAS_NODE } from "../canvas/canvas-layout";
import { BAND_LABEL, PEEK, type NeighbourBand } from "./neighbours-layout";

/** A neighbour's card reads behind the arc drawn through its inks, never a deep opacity (research, round 14: faded
 *  but pressable words keep 4.5:1, WCAG 1.4.3): its surface and edge fainter than a card's, its words muted, its pie
 *  at this strength (3:1 for a meaningful graphic, WCAG 1.4.11). */
export const NEIGHBOUR_GLYPH = 0.6;
/** A band's name: 16 in from its own start, or 64 in from the visible left edge while that is out of view. */
const LABEL_IN = 16;
/** Clear of the map's edge fade (Home's vignette is 64 across). */
const STICK_IN = 64;

export type NeighbourBandFlowNode = Node<{ band: NeighbourBand }, "neighbourBand">;
export type NeighbourCardFlowNode = Node<{ topic: CourseMapTopic; arc: ArcHandle; arcTitle: string; side: NeighbourBand["side"] }, "neighbourCard">;

/**
 * A faded band for the arc before or after the one drawn (neighbours.md):
 * a whisper of a surface under that arc's cards, its number and name quiet
 * on the left, above the cards for the arc before and below them for the
 * arc after. A press anywhere on it loads that arc.
 */
export function NeighbourBandNode({ data, positionAbsoluteX }: NodeProps<NeighbourBandFlowNode>) {
	const { band } = data;
	const openArc = useContext(TopicMapContext)?.openArc;
	// The name stays whole on screen: 64 in from the frame's left edge while the band's own start is out of view.
	const left = Math.max(LABEL_IN, useFrameLeft(STICK_IN) - positionAbsoluteX);
	const label = (
		<ArcLabel number={band.number} handle={band.arc.handle} title={band.arc.title} className="transition-colors group-hover/band:text-foreground motion-reduce:transition-none" />
	);
	return (
		<button
			type="button"
			data-slot="neighbour-band"
			data-side={band.side}
			data-arc={band.arc.handle}
			aria-label={`Open ${band.arc.title}`}
			onClick={() => openArc?.(band.arc.handle)}
			className={cn(
				"group/band pointer-events-auto relative flex size-full cursor-pointer flex-col px-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
				band.side === "before" ? "justify-start" : "justify-end",
			)}
		>
			<span className="absolute flex items-center" style={{ height: BAND_LABEL, left: 0, transform: `translateX(${left}px)`, ...(band.side === "before" ? { top: 0 } : { bottom: 0 }) }}>
				{label}
			</span>
		</button>
	);
}

/**
 * A neighbouring arc's card, faded and cut at its band's edge (neighbours.md):
 * the arc before's shows its bottom (its title), the arc after's its top
 * (what it says and its title), the cut edge fading into the band. A press
 * loads its arc; its own page is one press further, from that arc.
 */
export function NeighbourCardNode({ data }: NodeProps<NeighbourCardFlowNode>) {
	const { topic, arc, arcTitle, side } = data;
	const openArc = useContext(TopicMapContext)?.openArc;
	const standing = standingOf(topic);
	const cut = CANVAS_NODE.height - PEEK.before;
	return (
		<button
			type="button"
			tabIndex={-1}
			data-slot="neighbour-card"
			data-side={side}
			data-arc={arc}
			data-topic={topic.handle}
			aria-label={`${topic.title}: open ${arcTitle}`}
			onClick={(e) => {
				e.stopPropagation();
				openArc?.(arc);
			}}
			className="group/near pointer-events-auto relative block size-full cursor-pointer overflow-hidden text-left"
			style={{
				maskImage: side === "before" ? "linear-gradient(to bottom, transparent, black 8px)" : "linear-gradient(to top, transparent, black 10px)",
			}}
		>
			<BaseNode
				className="absolute inset-x-0 flex flex-col border-white/5 bg-white/[0.015] transition-colors group-hover/near:border-white/12 motion-reduce:transition-none"
				style={{ height: CANVAS_NODE.height, top: side === "before" ? -cut : 0 }}
			>
				<BaseNodeHeader className="h-6 shrink-0 border-b border-white/4">
					<span className="truncate text-callout text-muted-foreground transition-colors group-hover/near:text-foreground motion-reduce:transition-none">{standing.words}</span>
				</BaseNodeHeader>
				<BaseNodeContent className="min-h-0 flex-1">
					<span className="flex shrink-0" style={{ opacity: NEIGHBOUR_GLYPH }}>
						<TopicGlyph standing={standing} />
					</span>
					<MathLine className="h-4.5 min-w-0 flex-1 text-body text-muted-foreground transition-colors group-hover/near:text-foreground motion-reduce:transition-none">{topic.title}</MathLine>
				</BaseNodeContent>
			</BaseNode>
		</button>
	);
}
