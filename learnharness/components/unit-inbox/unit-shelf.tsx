"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** How many rows a shelf shows before "Show more", and how many each press
 *  adds: T3 Code's settled tail. */
export const SHELF_TAIL = 10;
export const SHELF_PAGE = 25;

/** One folded shelf at the sidebar's foot (spec: unit-inbox.md), T3 Code's
 *  shelf: a 32px header with the name and a trailing chevron (no count: a
 *  bare number told him nothing, 13 Nov 2026),
 *  then its rows. A folded shelf still shows the open row, and a dot when
 *  a hidden row waits on the learner. Open, it shows its first rows, then
 *  "Show N more". */
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
	const [shownCount, setShownCount] = React.useState(SHELF_TAIL);
	if (items.length === 0) return null;
	const shown = folded ? items.filter(isActive) : items.slice(0, shownCount);
	const hidden = folded ? items.filter((i) => !isActive(i)) : [];
	const more = folded ? 0 : Math.min(SHELF_PAGE, items.length - shown.length);
	return (
		<li data-slot="unit-shelf" className={cn("flex list-none flex-col", className)}>
			<h2 className="contents">
				<button
					type="button"
					id={headerId}
					data-slot="unit-section-header"
					data-sidebar-row={`shelf:${id}`}
					aria-expanded={!folded}
					onClick={() => onFoldedChange(!folded)}
					className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-label font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
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
				</button>
			</h2>
			<ul aria-labelledby={headerId} className="flex flex-col gap-px">
				{shown.map(renderItem)}
				{more > 0 && (
					<li className="list-none">
						<button
							type="button"
							data-slot="unit-shelf-more"
							data-sidebar-row={`more:${id}`}
							data-sidebar-parent={`shelf:${id}`}
							onClick={() => setShownCount((n) => n + SHELF_PAGE)}
							className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-control text-muted-foreground outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
						>
							<ChevronDownIcon aria-hidden className="size-4 shrink-0" />
							Show {more} more
						</button>
					</li>
				)}
			</ul>
		</li>
	);
}
