"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** How many rows a long shelf (Known, Other) shows before "Show all". */
export const SHELF_TAIL = 10;

/** One shelf of the inbox (spec: unit-inbox.md): a 32px header button with
 *  the name, the count and a chevron, and its rows. A folded shelf still
 *  shows the row whose page is open, and a dot when a hidden row waits on
 *  the learner. A long shelf shows its first rows and "Show all". */
export function UnitShelf<T>({
	label,
	items,
	folded,
	onFoldedChange,
	isActive,
	waits,
	renderItem,
	tail = Infinity,
	className,
}: {
	label: string;
	items: readonly T[];
	folded: boolean;
	onFoldedChange: (folded: boolean) => void;
	/** The row whose page is open, kept in view while folded. */
	isActive: (item: T) => boolean;
	/** The row waits on the learner. */
	waits: (item: T) => boolean;
	renderItem: (item: T) => React.ReactNode;
	/** Rows shown before "Show all"; every row when left out. */
	tail?: number;
	className?: string;
}) {
	const id = React.useId();
	const [all, setAll] = React.useState(false);
	if (items.length === 0) return null;
	const shown = folded ? items.filter(isActive) : all ? items : items.slice(0, tail);
	const hidden = folded ? items.filter((i) => !isActive(i)) : [];
	const more = folded || all ? 0 : items.length - shown.length;
	return (
		<section data-slot="unit-shelf" aria-labelledby={id} className={cn("flex flex-col", className)}>
			<h2 className="contents">
				<button
					type="button"
					id={id}
					data-slot="unit-section-header"
					aria-expanded={!folded}
					onClick={() => onFoldedChange(!folded)}
					className="group/shelf flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-label font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					<span className="min-w-0 truncate">{label}</span>
					<span data-slot="unit-shelf-count" className="font-normal tabular-nums">
						{items.length}
					</span>
					{hidden.some(waits) && (
						<span data-slot="unit-shelf-attention" className="size-1.5 rounded-full bg-link">
							<span className="sr-only">, your turn</span>
						</span>
					)}
					<ChevronDownIcon
						aria-hidden
						className={cn(
							"ml-auto size-3.5 shrink-0 transition-[opacity,transform] duration-150 motion-reduce:transition-none",
							folded ? "-rotate-90" : "opacity-0 group-hover/shelf:opacity-100 group-focus-visible/shelf:opacity-100",
						)}
					/>
				</button>
			</h2>
			{shown.map(renderItem)}
			{more > 0 && (
				<button
					type="button"
					data-slot="unit-shelf-more"
					onClick={() => setAll(true)}
					className="flex h-8 w-full items-center rounded-md pl-8 pr-2 text-left text-label text-muted-foreground outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					Show all {items.length}
				</button>
			)}
		</section>
	);
}
