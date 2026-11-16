"use client";

import { useEffect, useRef } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { isTypingSurface, type ArcHandle, type CourseMapArc } from "@/src/core";
import { overlayOpen } from "@/components/spatial-arrows";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { mathPlain } from "@/components/ui/math-text";
import { ArcLabel } from "./topic-map/arcs/arc-label";

/** The keys that glide to the arc above and below. Not in the key registry while the style sits behind the map
 *  switch, so the cheat sheet never offers a key that Current ignores; it joins Home's keys there when it ships. */
export const ARC_UP = "shift+arrowup";
export const ARC_DOWN = "shift+arrowdown";

/**
 * The arc rail of Stacked arcs (stack.md): the arc shown, emphasised,
 * between the arc above and the arc below, each a press that glides the map
 * there, its chevron the way it goes. At the first arc the up row holds only
 * its chevron, disabled, and at the last the down row; every name is whole.
 * ⇧↑ and ⇧↓ do the same from anywhere on the page, unless a field has the
 * key or something is open over it.
 */
export function ArcTravel({ arcs, value, onSelect, className }: { arcs: readonly CourseMapArc[]; value: ArcHandle | null; onSelect: (arc: ArcHandle) => void; className?: string }) {
	const at = Math.max(0, arcs.findIndex((a) => a.handle === value));
	const shown = arcs[at];
	const above = arcs[at - 1] ?? null;
	const below = arcs[at + 1] ?? null;
	const go = useRef({ above, below, onSelect });
	go.current = { above, below, onSelect };
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
			if (isTypingSurface(e) || overlayOpen()) return;
			const to = e.key === "ArrowUp" ? go.current.above : go.current.below;
			if (!to) return;
			e.preventDefault();
			// Before a focused card's own arrow walk.
			e.stopPropagation();
			go.current.onSelect(to.handle);
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, []);
	if (!shown) return null;
	const number = (arc: CourseMapArc) => arcs.indexOf(arc) + 1;
	const row = (arc: CourseMapArc | null, way: "up" | "down") => {
		const Icon = way === "up" ? ChevronUpIcon : ChevronDownIcon;
		const words = way === "up" ? "Up to" : "Down to";
		const button = (
			<Button
				variant="quiet"
				data-slot="arc-travel-step"
				data-way={way}
				data-arc={arc?.handle}
				disabled={!arc}
				aria-label={arc ? `${words} ${mathPlain(arc.title)}` : way === "up" ? "First arc" : "Last arc"}
				onClick={(e) => {
					blurAfterPointerClick(e);
					if (arc) onSelect(arc.handle);
				}}
				className="lh-no-drag group/step -ml-1.5 h-6 justify-start gap-1.5 rounded-md px-1.5 disabled:opacity-40"
			>
				<Icon aria-hidden="true" className="size-3.5 shrink-0" />
				{arc && <ArcLabel number={number(arc)} handle={arc.handle} title={arc.title} className="transition-colors group-hover/step:text-foreground motion-reduce:transition-none" />}
			</Button>
		);
		return arc ? (
			<Hint label={`${words} ${mathPlain(arc.title)}`} binding={way === "up" ? ARC_UP : ARC_DOWN} side="right">
				{button}
			</Hint>
		) : (
			button
		);
	};
	return (
		<nav data-slot="arc-travel" aria-label="Arcs" className={className}>
			{row(above, "up")}
			<div data-slot="arc-travel-here" data-arc={shown.handle} aria-current="true" className="flex h-6 items-center pl-[1.625rem]">
				<ArcLabel number={at + 1} handle={shown.handle} title={shown.title} here className="text-body font-medium text-foreground" />
			</div>
			{row(below, "down")}
		</nav>
	);
}
