"use client";

import { ChevronDownIcon } from "lucide-react";
import { rowSurface } from "@/components/unit-inbox/row-card";
import { cn } from "@/lib/utils";

/**
 * The tail under a card whose line takes up more topics than show (spec:
 * ../inbox-topics.md), T3 Code's "Show N more" and "Show less": a 36px
 * row, 14/400 muted, a 16px chevron (up once open), on the rows' own
 * surface, its words on the companions' title edge. Pressing it opens the
 * rest in place, or folds them back; the caller moves focus to the first
 * row it revealed. Left goes back to the card.
 */
export function CompanionTail({
	count,
	open,
	rowKey,
	parent,
	onToggle,
}: {
	count: number;
	open: boolean;
	rowKey: string;
	parent: string;
	onToggle: () => void;
}) {
	return (
		<li data-slot="companion-more" className="group/sidebar-row relative list-none">
			<button
				type="button"
				aria-expanded={open}
				data-sidebar-row={rowKey}
				data-sidebar-parent={parent}
				onClick={onToggle}
				className={cn(rowSurface(false), "flex h-9 items-center gap-2 px-2.5 text-control text-muted-foreground hover:text-foreground")}
			>
				<ChevronDownIcon aria-hidden className={cn("size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")} />
				{open ? "Show less" : `Show ${count} more`}
			</button>
		</li>
	);
}
