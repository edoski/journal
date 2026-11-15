"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moreWords } from "@/components/study-words";

/** How many rows a shelf shows before "Show the rest": T3 Code's settled
 *  tail. One press shows every hidden row, as a course page's group does,
 *  so the sidebar names the action one way (round 4: "Show the rest" and
 *  "Show more" were two names for it). */
export const SHELF_TAIL = 10;

/** One folded shelf at the sidebar's foot (spec: unit-inbox.md), T3 Code's
 *  shelf: a 32px header with the name and a trailing chevron (no count: a
 *  bare number told him nothing, 13 Nov 2026),
 *  then its rows. A folded shelf still shows the open row, and a dot when
 *  a hidden row waits on the learner. Open, it shows its first rows, then
 *  "Show the rest" (`moreWords`), which shows them all. */
export function UnitShelf<T>({
	id,
	label,
	items,
	folded,
	onFoldedChange,
	isActive,
	waits,
	renderItem,
	className,
}: {
	/** The keyboard walk's name for the shelf (`shelf:<id>`). */
	id: string;
	label: string;
	items: readonly T[];
	folded: boolean;
	onFoldedChange: (folded: boolean) => void;
	/** The row whose page is open, kept in view while folded. */
	isActive: (item: T) => boolean;
	/** The row waits on the learner. */
	waits: (item: T) => boolean;
	renderItem: (item: T) => React.ReactNode;
	className?: string;
}) {
	const headerId = React.useId();
	const [whole, setWhole] = React.useState(false);
	if (items.length === 0) return null;
	const shown = folded ? items.filter(isActive) : whole ? items : items.slice(0, SHELF_TAIL);
	const hidden = folded ? items.filter((i) => !isActive(i)) : [];
	const rest = folded ? 0 : items.length - shown.length;
	return (
		<li data-slot="unit-shelf" className={cn("flex list-none flex-col", className)}>
			<h2 className="contents">
				<Button
					variant="list"
					size="row"
					id={headerId}
					data-slot="unit-section-header"
					data-sidebar-row={`shelf:${id}`}
					aria-expanded={!folded}
					onClick={() => onFoldedChange(!folded)}
					className="h-8 gap-2 px-2 text-label font-medium hover:bg-transparent focus-visible:ring-inset"
				>
					<span className="min-w-0 truncate">{label}</span>
					<span aria-hidden className="flex-1" />
					{hidden.some(waits) && (
						<span data-slot="unit-shelf-attention" className="size-1.5 rounded-full bg-link">
							<span className="sr-only">, your turn</span>
						</span>
					)}
					<ChevronDownIcon
						aria-hidden
						className={cn("size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none", folded && "-rotate-90")}
					/>
				</Button>
			</h2>
			<ul aria-labelledby={headerId} className="flex flex-col gap-px">
				{shown.map(renderItem)}
				{rest > 0 && (
					<li className="list-none">
						<Button
							variant="list"
							size="row"
							data-slot="unit-shelf-more"
							data-sidebar-row={`more:${id}`}
							data-sidebar-parent={`shelf:${id}`}
							onClick={() => setWhole(true)}
							className="h-9 gap-2 px-2.5 text-control focus-visible:ring-inset"
						>
							<ChevronDownIcon aria-hidden className="size-4 shrink-0" />
							{moreWords(rest, Infinity)}
						</Button>
					</li>
				)}
			</ul>
		</li>
	);
}
