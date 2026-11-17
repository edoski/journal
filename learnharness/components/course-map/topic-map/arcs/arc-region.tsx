"use client";

import Link from "next/link";
import type { Node, NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Ring } from "@/components/ui/pie";
import { MathText } from "@/components/ui/math-text";
import { arcHref } from "@/components/unit-inbox/unit-href";
import { useCanvas } from "../canvas/canvas-context";
import { useArcOpen } from "./arc-open";
import type { ArcRegion } from "./arc-layout";
import { ArcLabel } from "./arc-label";

export type ArcRegionFlowNode = Node<{ region: ArcRegion; share: number | null }, "arcRegion">;

/**
 * One arc on the map (arcs.md): open, a softly tinted region holding its
 * topics under its number and name, quiet (`ArcLabel`); folded, one card
 * with its number, ring and whole name, which opens it in place (on the
 * course page, its place there). No counts (Edo's standing rule). A region that is not where he is folds
 * back from its header.
 */
export function ArcRegionNode({ data }: NodeProps<ArcRegionFlowNode>) {
	const { region, share } = data;
	const arcOpen = useArcOpen();
	const focus = useCanvas()?.focus ?? null;
	const lit = focus !== null && region.topics.includes(focus.topic);
	if (!region.open) return <ArcCard region={region} share={share} />;
	const folds = arcOpen?.ownCamera && !region.here && arcOpen.opened === region.arc.handle;
	return (
		<div
			data-slot="arc-region"
			data-arc={region.arc.handle}
			data-here={region.here || undefined}
			className={cn("size-full rounded-2xl border bg-white/[0.025] transition-colors duration-150 motion-reduce:transition-none", lit ? "border-white/16" : "border-white/8")}
		>
			<div className="absolute top-4 left-4 flex max-w-[calc(100%-2rem)] items-center">
				{folds ? (
					<button type="button" aria-expanded="true" aria-label={`Fold ${region.arc.title}`} onClick={() => arcOpen.open(null)} className="pointer-events-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
						<ArcLabel number={region.number} handle={region.arc.handle} title={region.arc.title} here={region.here} />
					</button>
				) : (
					<ArcLabel number={region.number} handle={region.arc.handle} title={region.arc.title} here={region.here} />
				)}
			</div>
		</div>
	);
}

/** A folded arc's card (arcs.md, Overview). */
function ArcCard({ region, share }: { region: ArcRegion; share: number | null }) {
	const arcOpen = useArcOpen();
	const face = (
		<>
			<span className="flex min-w-0 items-start gap-2">
				<span aria-hidden="true" className="mt-px w-4 shrink-0 text-right text-callout font-medium text-muted-foreground tabular-nums">
					{region.number}
				</span>
				{share !== null && <Ring aria-hidden share={share} className="size-4 shrink-0" />}
				<span data-slot="arc-card-title" className="line-clamp-2 min-w-0 text-body text-foreground">
					<MathText>{region.arc.title}</MathText>
				</span>
			</span>
		</>
	);
	const look = "pointer-events-auto flex size-full cursor-pointer flex-col justify-center gap-1 rounded-xl border border-white/10 bg-card px-3 text-left outline-none transition-colors duration-150 hover:border-white/24 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";
	if (arcOpen && !arcOpen.ownCamera) {
		return (
			<Link data-slot="arc-card" data-arc={region.arc.handle} href={arcHref(arcOpen.workspace, region.arc.handle)} aria-label={`Open ${region.arc.title}`} className={look}>
				{face}
			</Link>
		);
	}
	return (
		<button type="button" data-slot="arc-card" data-arc={region.arc.handle} aria-expanded="false" aria-label={`Open ${region.arc.title}`} onClick={() => arcOpen?.open(region.arc.handle)} className={look}>
			{face}
		</button>
	);
}
