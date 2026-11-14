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

/**
 * Every row's trailing slot, flush to the row's right padding, so the
 * slots of cards, shelf rows and session rows end on one edge. The course
 * name and title beside it take the room they need first; the slot gets
 * the rest and gives way: its mark is a flat run of icon and words
 * (`contents` roots, every part 16px tall), and words that do not fit
 * beside the icon wrap onto a second line pushed out of the slot and
 * clipped, so the icon stays alone and nothing is cut mid-word (Edo, 14
 * Nov 2026: the name and title win the space). Give it its line's height
 * with the padding that centres one 16px line (`py-0.5` in 20px, `py-1`
 * in 24px). Words with no icon ("3d ago") have nothing to give way to,
 * so they keep their width.
 */
export const TRAILING_SLOT =
	"relative ml-auto flex min-w-3 flex-1 basis-0 flex-wrap content-start items-center justify-end gap-x-1 gap-y-8 overflow-hidden text-label tabular-nums text-muted-foreground has-[[data-kind=studied]]:min-w-fit";

/** The trailing slot of a row with an action: its mark fades out while the
 *  row is hovered or its action has keyboard focus, so the action takes
 *  its place without moving anything. */
export const STATUS_SLOT = cn(
	TRAILING_SLOT,
	"transition-opacity motion-reduce:transition-none group-hover/sidebar-row:opacity-0 group-has-[[data-slot=row-action]:focus-visible]/sidebar-row:opacity-0",
);

/** A row's one action, over its status slot: hidden until the row is
 *  hovered or the action has keyboard focus. The caller places it. */
export const ROW_ACTION =
	"pointer-events-none absolute inline-flex items-center gap-1 rounded-md px-1.5 text-label font-medium text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/sidebar-row:pointer-events-auto group-hover/sidebar-row:opacity-100 hover:bg-transparent disabled:opacity-0 group-hover/sidebar-row:disabled:opacity-100 motion-reduce:transition-none [&>svg]:size-3";

/** Where a card's action sits: over the status slot of line 1. */
export const CARD_ACTION_PLACE = "right-2.5 top-2.5 h-5";

/**
 * The sidebar's two-line card (60px, spec: unit-inbox.md), the shell every
 * card shares: line 1 the course's mark and name with the status slot,
 * which gives way to its icon before the name is cut; line 2 the title at
 * 14/500 on the name's edge, where a shelf row's title starts, as Home's
 * row keeps its pie beside both lines, wrapping onto a second line rather
 * than cut; the whole card one link, its action (if any) over the status
 * slot. `recede` dims a card the tutor writes in to 70% until its row is
 * hovered or anything in it (the card or its action) has keyboard focus,
 * so moving onto the action keeps it lit.
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
					"flex min-h-[3.75rem] flex-col px-2.5 py-2",
					recede && !active && "opacity-70 group-hover/sidebar-row:opacity-100 group-has-[:focus-visible]/sidebar-row:opacity-100",
				)}
			>
				<span className="flex h-5 items-center gap-2">
					{mark}
					<span className="min-w-0 truncate text-label text-muted-foreground">{course}</span>
					<span data-slot="unit-status-slot" className={cn(STATUS_SLOT, "h-5 py-0.5")}>
						{status}
					</span>
				</span>
				<span className="mt-1 pl-6 text-control font-medium text-pretty text-foreground">
					<MathText>{title}</MathText>
				</span>
			</Link>
			{action}
		</li>
	);
}
