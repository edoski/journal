"use client";

import Link from "next/link";
import type { ArcHandle } from "@/src/core";
import { Ring } from "@/components/ui/pie";
import { MathText } from "@/components/ui/math-text";
import { toggleVariants } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

/** One arc as a pill names it: its title and its ring's share. */
export interface StripArc {
	handle: ArcHandle;
	title: string;
	/** The share of its topics he can do on his own; null draws no ring. */
	share: number | null;
}

type PillSize = "segment" | "segment-sm" | "segment-xs";

/** What every arc pill holds: the arc's ring, then its name, which ends in
 *  … when the pill runs out of room. */
function PillFace({ arc, size }: { arc: StripArc; size: PillSize }) {
	return (
		<>
			{arc.share !== null && <Ring aria-hidden share={arc.share} className={size === "segment" ? undefined : "size-3.5"} />}
			<span className="min-w-0 truncate">
				<MathText>{arc.title}</MathText>
			</span>
		</>
	);
}

const pillGap = (size: PillSize) => (size === "segment" ? "gap-2" : "gap-1.5");

/**
 * One arc, as the strip's pills draw it (shadcn's Toggle, `pill`): the
 * only way an arc is named anywhere, never as "Course · Arc" text (Edo,
 * 14 Nov 2026). `on` draws it on the selected fill. With `href` it is a
 * link (the course page with that arc shown), else a plain mark. `size`
 * `segment-xs` keeps a line of facts at its height.
 */
export function ArcPill({ arc, href, on = false, size = "segment-xs", className }: { arc: StripArc; href?: string; on?: boolean; size?: PillSize; className?: string }) {
	const look = cn(toggleVariants({ variant: "pill", size }), "max-w-full min-w-0", pillGap(size), className);
	const state = on ? "on" : "off";
	if (href) {
		return (
			<Link href={href} data-slot="arc-pill" data-arc={arc.handle} data-state={state} className={look}>
				<PillFace arc={arc} size={size} />
			</Link>
		);
	}
	return (
		<span data-slot="arc-pill" data-arc={arc.handle} data-state={state} className={cn(look, "pointer-events-none")}>
			<PillFace arc={arc} size={size} />
		</span>
	);
}

/**
 * The arc strip (spec: topic-map/topic-map.md, Arcs): the course's arcs in
 * study order as pills above a map (shadcn's ToggleGroup, `pill`, the same
 * pill as `ArcPill`), each its ring and its name, no counts; the shown arc
 * on the selected fill, the others quiet. Bubbles, never underline tabs,
 * so the arcs never read as Home's course tabs (Edo, 14 Nov 2026). A press
 * shows that arc (`onSelect`); the arrows move between pills. `quiet`
 * draws it a step smaller, under Home's course tabs.
 */
export function ArcStrip({
	arcs,
	value,
	onSelect,
	quiet = false,
	className,
}: {
	arcs: readonly StripArc[];
	value: ArcHandle | null;
	onSelect: (arc: ArcHandle) => void;
	quiet?: boolean;
	className?: string;
}) {
	const size: PillSize = quiet ? "segment-sm" : "segment";
	return (
		<ToggleGroup
			type="single"
			variant="pill"
			size={size}
			aria-label="Arc"
			data-slot="arc-strip"
			value={value ?? ""}
			// One arc is always shown: a press on the shown one keeps it.
			onValueChange={(v) => v && onSelect(v as ArcHandle)}
			className={cn("max-w-full min-w-0 overflow-hidden", className)}
		>
			{arcs.map((arc) => (
				<ToggleGroupItem key={arc.handle} value={arc.handle} data-arc={arc.handle} className={cn("lh-no-drag min-w-0 shrink", pillGap(size))}>
					<PillFace arc={arc} size={size} />
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
