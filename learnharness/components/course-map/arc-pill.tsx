"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ArcHandle } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Ring } from "@/components/ui/pie";
import { MathText } from "@/components/ui/math-text";
import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

/** One arc as a pill names it: its title and its ring's share. */
export interface PillArc {
	handle: ArcHandle;
	title: string;
	/** The share of its topics he can do on his own; null draws no ring. */
	share: number | null;
}

type PillSize = "segment-sm" | "segment-xs";

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
	// The same elements whether cut or not, so the measured span stays the same node; the tooltip opens only on a cut name.
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
function PillFace({ arc }: { arc: PillArc }) {
	return (
		<>
			{arc.share !== null && <Ring aria-hidden share={arc.share} className="size-3.5" />}
			<ArcName title={arc.title} />
		</>
	);
}

/**
 * One arc as a pill (arc-pill.md; shadcn's Toggle, `pill`): the
 * only way an arc is named anywhere, never as "Course · Arc" text (Edo,
 * 14 Nov 2026), its name whole up to the width where it sits (`ArcName`).
 * With `href` it is a link (the
 * course page with that arc shown, as the topic page's head opens it),
 * else a plain mark. `size` `segment-xs` keeps a line of facts at its
 * height; `segment-sm` is the topic head's.
 */
export function ArcPill({ arc, href, size = "segment-xs", className }: { arc: PillArc; href?: string; size?: PillSize; className?: string }) {
	const look = cn(toggleVariants({ variant: "pill", size }), "max-w-full min-w-0 gap-1.5", className);
	if (href) {
		return (
			<Link href={href} onClick={blurAfterPointerClick} data-slot="arc-pill" data-arc={arc.handle} className={look}>
				<PillFace arc={arc} />
			</Link>
		);
	}
	return (
		<span data-slot="arc-pill" data-arc={arc.handle} className={cn(look, "pointer-events-none")}>
			<PillFace arc={arc} />
		</span>
	);
}
