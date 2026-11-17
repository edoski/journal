"use client";

import { ChevronDownIcon } from "lucide-react";
import type { ArcHandle } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/hint";
import { MathText, mathPlain } from "@/components/ui/math-text";
import { Ring } from "@/components/ui/pie";
import { cn } from "@/lib/utils";
import type { StripArc } from "./arc-strip";

/** The words beside the arc he is in, in the selector's menu. */
export const HERE_WORDS = "You are here";

/**
 * Which arc a course map shows (spec: arc-selector.md), quiet and on one
 * line above the map, for every map style but Current: the shown arc's
 * whole name opens a menu of every arc in study order (its ring, its whole
 * name, "You are here" beside the arc he is in), and a rail of one dot per
 * arc says where the shown arc sits in the course, the arc he is in ringed.
 * A dot is a press target that shows its arc, named under the pointer.
 * Edo, 16 Nov 2026, on the pill strip: "too in the way… how can we better
 * integrate arcs selectors while being a bit more minimalist".
 */
export function ArcSelector({
	arcs,
	value,
	here,
	onSelect,
	className,
}: {
	arcs: readonly StripArc[];
	/** The arc the map shows. */
	value: ArcHandle | null;
	/** The arc of "You are here"; null when he is in none. */
	here: ArcHandle | null;
	onSelect: (arc: ArcHandle) => void;
	className?: string;
}) {
	const shown = arcs.find((a) => a.handle === value) ?? arcs[0];
	if (!shown) return null;
	return (
		<div data-slot="arc-selector" role="group" aria-label="Arc" className={cn("flex h-7 min-w-0 items-center gap-2", className)}>
			<DropdownMenu>
				<DropdownMenuTrigger
					data-slot="arc-selector-menu"
					className="lh-no-drag -ml-2 flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-md px-2 text-body whitespace-nowrap text-foreground outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-fill-hover motion-reduce:transition-none"
				>
					<MathText>{shown.title}</MathText>
					<ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" data-slot="arc-selector-list" className="w-max max-w-[min(36rem,var(--radix-dropdown-menu-content-available-width))]">
					<DropdownMenuRadioGroup value={shown.handle} onValueChange={(v) => onSelect(v as ArcHandle)}>
						{arcs.map((arc) => (
							<DropdownMenuRadioItem key={arc.handle} value={arc.handle} data-arc={arc.handle} className="pr-8">
								{arc.share !== null ? <Ring aria-hidden share={arc.share} className="size-3.5" /> : <span aria-hidden className="size-3.5 shrink-0" />}
								<span className="flex-1 whitespace-nowrap">
									<MathText>{arc.title}</MathText>
								</span>
								{arc.handle === here && <span className="pl-4 text-callout text-muted-foreground">{HERE_WORDS}</span>}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<ArcRail arcs={arcs} value={shown.handle} here={here} onSelect={onSelect} />
		</div>
	);
}

/** One dot per arc in study order: the shown arc filled, the arc he is in
 *  ringed, each a press target that shows its arc. ← → step along it. */
function ArcRail({ arcs, value, here, onSelect }: { arcs: readonly StripArc[]; value: ArcHandle; here: ArcHandle | null; onSelect: (arc: ArcHandle) => void }) {
	return (
		<div
			data-slot="arc-rail"
			className="flex items-center"
			onKeyDown={(e) => {
				if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
				const at = arcs.findIndex((a) => a.handle === value);
				const next = arcs[at + (e.key === "ArrowRight" ? 1 : -1)];
				if (!next) return;
				e.preventDefault();
				onSelect(next.handle);
				requestAnimationFrame(() => e.currentTarget.querySelector<HTMLElement>(`[data-arc="${next.handle}"]`)?.focus());
			}}
		>
			{arcs.map((arc) => {
				const on = arc.handle === value;
				return (
					<Hint key={arc.handle} label={mathPlain(arc.title) + (arc.handle === here ? `, ${HERE_WORDS.toLowerCase()}` : "")} side="bottom">
						<button
							type="button"
							data-arc={arc.handle}
							data-state={on ? "on" : "off"}
							data-here={arc.handle === here || undefined}
							aria-label={mathPlain(arc.title)}
							aria-current={on || undefined}
							tabIndex={on ? 0 : -1}
							onClick={(e) => {
								blurAfterPointerClick(e);
								onSelect(arc.handle);
							}}
							className="lh-no-drag group/dot flex h-7 w-4 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<span
								aria-hidden
								className={cn(
									"size-1.5 rounded-full transition-colors motion-reduce:transition-none",
									on ? "bg-foreground" : "bg-muted-foreground/45 group-hover/dot:bg-muted-foreground",
									arc.handle === here && "outline outline-1 outline-offset-2 outline-muted-foreground",
								)}
							/>
						</button>
					</Hint>
				);
			})}
		</div>
	);
}
