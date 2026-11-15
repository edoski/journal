"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ArcHandle } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

/** An arc's name, whole. Only a name wider than its pill's stated width
 *  (`max-w-*` where the pill sits) ends in …, and then shows whole in a
 *  tooltip under the pointer (round 6: "Sam…", "De…" meant nothing). */
function ArcName({ title }: { title: string }) {
	const ref = useRef<HTMLSpanElement>(null);
	const [cut, setCut] = useState(false);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		let live = true;
		const measure = () => live && setCut(el.scrollWidth > el.clientWidth + 0.5);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		void document.fonts?.ready.then(measure);
		return () => {
			live = false;
			observer.disconnect();
		};
	}, [title]);
	// One tree whether cut or not, so the measured span stays the same node; the tooltip opens only on a cut name.
	return (
		<Tooltip {...(cut ? {} : { open: false })}>
				{/* Hover only, as `Hint`: Tab is dead app-wide. */}
				<TooltipTrigger asChild onFocus={(e) => e.preventDefault()}>
					<span ref={ref} data-slot="arc-name" data-cut={cut || undefined} className="min-w-0 truncate data-cut:pointer-events-auto">
						<MathText>{title}</MathText>
					</span>
				</TooltipTrigger>
				<TooltipContent>
					<MathText>{title}</MathText>
				</TooltipContent>
		</Tooltip>
	);
}

/** What every arc pill holds: the arc's ring, then its name (`ArcName`). */
function PillFace({ arc, size }: { arc: StripArc; size: PillSize }) {
	return (
		<>
			{arc.share !== null && <Ring aria-hidden share={arc.share} className={size === "segment" ? undefined : "size-3.5"} />}
			<ArcName title={arc.title} />
		</>
	);
}

const pillGap = (size: PillSize) => (size === "segment" ? "gap-2" : "gap-1.5");

/**
 * One arc, as the strip's pills draw it (shadcn's Toggle, `pill`): the
 * only way an arc is named anywhere, never as "Course · Arc" text (Edo,
 * 14 Nov 2026), its name whole up to the width where it sits (`ArcName`).
 * `on` draws it on the selected fill. With `href` it is a link (the
 * course page with that arc shown, as the topic page's head opens it),
 * else a plain mark. `size` `segment-xs` keeps a line of facts at its
 * height; `segment-sm` is the topic head's.
 */
export function ArcPill({ arc, href, on = false, size = "segment-xs", className }: { arc: StripArc; href?: string; on?: boolean; size?: PillSize; className?: string }) {
	const look = cn(toggleVariants({ variant: "pill", size }), "max-w-full min-w-0", pillGap(size), className);
	const state = on ? "on" : "off";
	if (href) {
		return (
			<Link href={href} onClick={blurAfterPointerClick} data-slot="arc-pill" data-arc={arc.handle} data-state={state} className={look}>
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
 * so the arcs never read as Home's course tabs (Edo, 14 Nov 2026). Each
 * pill keeps its whole name: the strip wraps onto another row before a
 * name is cut, and only a name wider than the strip itself ends in …,
 * whole in its tooltip; no scrollbar. A press shows that arc
 * (`onSelect`); the arrows move between pills. `quiet` draws it a step
 * smaller, under Home's course tabs.
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
			className={cn("max-w-full min-w-0 flex-wrap gap-y-1.5", className)}
		>
			{arcs.map((arc) => (
				<ToggleGroupItem key={arc.handle} value={arc.handle} data-arc={arc.handle} className={cn("lh-no-drag max-w-full min-w-0 shrink-0", pillGap(size))}>
					<PillFace arc={arc} size={size} />
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
