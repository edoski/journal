"use client";

import Link from "next/link";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

/** Every row's surface: a rounded block, the selected fill on the open
 *  page, the hover fill from its list item (so hovering its action keeps
 *  it), and an inset ring on keyboard focus. */
export const rowSurface = (active: boolean) =>
	cn(
		"relative w-full min-w-0 rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
		active ? "bg-fill-selected" : "group-hover/sidebar-row:bg-fill-hover",
	);

/** Every row's trailing slot, flush to the row's right padding, so the
 *  slots of cards, shelf rows and session rows end on one edge. */
export const TRAILING_SLOT = "relative ml-auto flex min-w-8 shrink-0 items-center justify-end text-label tabular-nums text-muted-foreground";

/** The status slot of a row with an action: its label fades out while the
 *  row is hovered or its action has keyboard focus, so the action takes
 *  its place without moving anything. */
export const STATUS_SLOT = cn(
	TRAILING_SLOT,
	"transition-opacity motion-reduce:transition-none group-hover/sidebar-row:opacity-0 group-has-[[data-slot=row-action]:focus-visible]/sidebar-row:opacity-0",
);

/** A row's one action, over its status slot: hidden until the row is
 *  hovered or the action has keyboard focus. The caller places it. */
export const ROW_ACTION =
	"pointer-events-none absolute inline-flex items-center gap-1 rounded-md px-1.5 text-label font-medium text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/sidebar-row:pointer-events-auto group-hover/sidebar-row:opacity-100 motion-reduce:transition-none [&>svg]:size-3";

/** Where a card's action sits: over the status slot of line 1. */
export const CARD_ACTION_PLACE = "right-2.5 top-2.5 h-5";

/**
 * The sidebar's two-line card (60px, spec: unit-inbox.md), the shell every
 * card shares: line 1 the course's mark and name with the status slot,
 * line 2 the title at 14/500 on the name's edge, where a shelf row's title
 * starts, as Home's row keeps its pie beside both lines; the whole card one
 * link, its action (if any) over the status slot. `recede` dims a card the tutor writes in to 70%
 * until its row is hovered or anything in it (the card or its action) has
 * keyboard focus, so moving onto the action keeps it lit; `capStatus` lets free words in the slot take up
 * to 60% of the line and truncate, the course name truncating first.
 */
export function RowCard({
	href,
	active,
	rowKey,
	parent,
	mark,
	course,
	status,
	title,
	action,
	recede = false,
	capStatus = false,
}: {
	href: string;
	active: boolean;
	/** The keyboard walk's name for the row (`data-sidebar-row`). */
	rowKey: string;
	/** The row the walk's Left goes back to (`data-sidebar-parent`). */
	parent?: string;
	mark: React.ReactNode;
	course: string;
	status: React.ReactNode;
	title: string;
	action?: React.ReactNode;
	recede?: boolean;
	capStatus?: boolean;
}) {
	return (
		<li data-slot="unit-card" className="group/sidebar-row relative list-none py-0.5">
			<Link
				href={href}
				onClick={blurAfterPointerClick}
				aria-current={active ? "page" : undefined}
				data-sidebar-row={rowKey}
				data-sidebar-parent={parent}
				data-testid="unit-row"
				className={cn(
					rowSurface(active),
					"flex h-[3.75rem] flex-col px-2.5 py-2",
					recede && !active && "opacity-70 group-hover/sidebar-row:opacity-100 group-has-[:focus-visible]/sidebar-row:opacity-100",
				)}
			>
				<span className="flex h-5 items-center gap-2">
					{mark}
					<span className="min-w-0 flex-1 truncate text-label text-muted-foreground">{course}</span>
					<span data-slot="unit-status-slot" className={cn(STATUS_SLOT, "h-5", capStatus && "max-w-[60%]")}>
						{status}
					</span>
				</span>
				<span className="mt-1 truncate pl-6 text-control font-medium text-foreground">
					<MathText>{title}</MathText>
				</span>
			</Link>
			{action}
		</li>
	);
}
