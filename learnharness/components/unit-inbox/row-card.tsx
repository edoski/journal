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
 * Every row's trailing slot: an icon and a few words, whole whatever the
 * title's length (Edo, 14 Nov 2026). The text beside it makes the room
 * first, the course name giving way whole; only words longer than the
 * whole line end in an ellipsis (`SLOT_WORDS`), never cut at the card's
 * edge (round 14, 1 n7: "After Random variables and distri"). Where it
 * sits is the sidebar's one row rule (`STATUS_LINE`, row-card.md).
 * Its mark is a flat run of icon and words (`contents` roots, every part
 * 16px tall). Give it its line's height with the padding that centres
 * one 16px line (`py-0.5` in 20px, `py-1` in 24px).
 */
export const TRAILING_SLOT =
	"ml-auto flex min-w-0 items-center justify-end gap-x-1 whitespace-nowrap text-callout tabular-nums text-muted-foreground";

/** A status's words in its slot: whole while the line holds them, else
 *  cut with an ellipsis, the icon before them kept. */
export const SLOT_WORDS = "min-w-0 truncate";

/**
 * The sidebar's one row rule (spec: row-card.md): every row is its title,
 * two lines at most, and one 20px line that holds its status, inside the
 * same 8 × 10 padding, so its height follows from its title alone: 60px,
 * or 80px for a title on two lines. A card's status line is its course
 * line (`RowCard`); a shelf row's is its own, under the title (`ROW_BODY`),
 * never beside it, so a short title and a long one sit at the same pitch.
 */
export const ROW_FRAME = "flex flex-col px-2.5 py-2";

/** Every row's title: T3 Code's thread title, 14px on a 20px line,
 *  wrapping onto a second and third line and cut only past them (round
 *  16, m25: "Review Random variables and distributions, Binomial…" cut a
 *  combined review's second topic with room below). `loud` is a row
 *  that needs him or is open (a card, the open row, a session waiting on
 *  him): 500 in full ink. Otherwise it is T3 Code's quiet row, 400 at 75%
 *  ink until the row is hovered or has keyboard focus. */
export const rowTitle = (loud: boolean) =>
	cn(
		"line-clamp-3 min-w-0 text-pretty",
		loud
			? "text-sidebar-title text-foreground"
			: "text-sidebar-title-quiet text-foreground/75 group-hover/sidebar-row:text-foreground group-has-[:focus-visible]/sidebar-row:text-foreground",
	);

/** A shelf row's first line: the course mark beside the title. */
export const ROW_BODY = "flex min-w-0 items-start gap-2";

/** The line a status sits on: 20px, the slot right-aligned on it. */
export const STATUS_LINE = "h-5 py-0.5";

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
	"pointer-events-none absolute inline-flex items-center gap-1 rounded-md px-1.5 text-callout text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/sidebar-row:pointer-events-auto group-hover/sidebar-row:opacity-100 hover:bg-transparent disabled:opacity-0 group-hover/sidebar-row:disabled:opacity-100 motion-reduce:transition-none [&>svg]:size-3";

/** Every row's list item: 2px above and below, so every row's pitch is
 *  its height plus 4. */
export const ROW_ITEM = "group/sidebar-row relative list-none py-0.5";

/** Where a card's action sits: over the status slot of line 1. */
export const CARD_ACTION_PLACE = "right-2.5 top-2.5 h-5";

/**
 * The sidebar's card (spec: row-card.md), the shell every card shares,
 * under the one row rule (`ROW_FRAME`): line 1 the course's mark and name
 * with the status slot, on one line always: the status keeps its words and
 * the name gives way, whole, when both do not fit (the mark still names
 * the course), never cut to "Linear Alg…". Then the title, T3 Code's at 500 (`rowTitle`), on the name's edge, where a
 * shelf row's title starts, two lines at most; the whole card one link,
 * its action (if any) over the status slot. `recede` dims a card the tutor
 * writes in to 70% until its row is hovered or anything in it (the card or
 * its action) has keyboard focus, so moving onto the action keeps it lit.
 */
export function RowCard({
	href,
	onSelect,
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
	/** Where the card goes; without it the card is a button that does
	 *  `onSelect` (a course line's lesson, started as Home's line starts it). */
	href?: string;
	onSelect?: () => void;
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
	const body = (
		<>
			<span className="flex h-5 items-center gap-2">
					<span className="flex h-5 shrink-0 items-center">{mark}</span>
					{/* The name whole or not at all: too long for the room beside the status, it wraps onto a second line the 20px line hides, after an empty first item, and the badge names the course (round 10, 1 m8: "Linear Alg…"). */}
					<span data-slot="unit-card-course" className="flex h-5 min-w-0 flex-1 flex-wrap overflow-hidden text-callout text-muted-foreground">
						<span aria-hidden="true" className="h-5 w-0" />
						<span className="whitespace-nowrap leading-5">{course}</span>
					</span>
					<span data-slot="unit-status-slot" className={cn(STATUS_SLOT, STATUS_LINE)}>
						{status}
					</span>
				</span>
			<span data-slot="unit-row-title" className={cn(rowTitle(true), "mt-1 pl-6")}>
				<MathText>{title}</MathText>
			</span>
		</>
	);
	const shared = {
		"aria-current": active ? ("page" as const) : undefined,
		"data-sidebar-row": rowKey,
		"data-sidebar-parent": parent,
		"data-testid": "unit-row",
		className: cn(
			rowSurface(active),
			ROW_FRAME,
			recede && !active && "opacity-70 group-hover/sidebar-row:opacity-100 group-has-[:focus-visible]/sidebar-row:opacity-100",
		),
	};
	return (
		<li data-slot="unit-card" className={ROW_ITEM}>
			{href !== undefined ? (
				<Link href={href} onClick={blurAfterPointerClick} {...shared}>
					{body}
				</Link>
			) : (
				<button
					type="button"
					onClick={(e) => {
						onSelect?.();
						blurAfterPointerClick(e);
					}}
					{...shared}
				>
					{body}
				</button>
			)}
			{action}
		</li>
	);
}
