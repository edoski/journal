import * as React from "react";
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/** The sidebar row (spec: nav-row.md): one 32px line, an optional 16px
 *  leading icon, the label, and a trailing column for one time or status.
 *  Resting ink is muted; hover lifts the fill one step and the ink to full,
 *  the active row holds the selected fill. No weight change on hover or
 *  selection, so nothing moves; `attention` (the row waits on the learner)
 *  is the one state drawn in full ink at 500. `inset` starts the label on a
 *  NavGroup's label edge. */
const navRowVariants = cva(
	"relative flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-row text-muted-foreground outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			state: {
				rest: "",
				active: "bg-fill-selected text-foreground hover:bg-fill-selected",
				highlighted: "bg-fill-hover text-foreground",
			},
			attention: {
				false: "",
				true: "font-medium text-foreground",
			},
			inset: {
				false: "",
				true: "pl-8",
			},
		},
		defaultVariants: { state: "rest", attention: false, inset: false },
	},
);

export function NavRow({
	asChild = false,
	active = false,
	highlighted = false,
	attention = false,
	inset = false,
	className,
	...props
}: React.ComponentProps<"button"> & {
	/** Render the child element (a Link) as the row. */
	asChild?: boolean;
	/** The page this row opens is the one showing. */
	active?: boolean;
	/** The keyboard walk's current row (the search's ↑/↓). */
	highlighted?: boolean;
	/** Waits on the learner: full ink at weight 500. */
	attention?: boolean;
	/** An item of a NavGroup: the label starts on the group's label edge (32px). */
	inset?: boolean;
}) {
	const Comp = asChild ? Slot.Root : "button";
	return (
		<Comp
			data-active={active || undefined}
			aria-current={active ? "page" : undefined}
			{...(asChild ? {} : { type: "button" as const })}
			className={cn(
				navRowVariants({ state: active ? "active" : highlighted ? "highlighted" : "rest", attention, inset }),
				className,
			)}
			{...props}
			// After the props: a wrapping trigger (a context menu's, asChild)
			// passes its own data-slot, and measurement finds rows by this one.
			data-slot="nav-row"
		/>
	);
}

export function NavRowLabel({ className, ...props }: React.ComponentProps<"span">) {
	return <span data-slot="nav-row-label" className={cn("min-w-0 flex-1 truncate", className)} {...props} />;
}

/** The right column: at least 32px, 24px high, right-aligned, holding one
 *  time or status in 12px tabular figures, so every row's trailing edge and
 *  every time's right edge line up. Its ink and weight are its own: muted
 *  400, whatever the row's label does. */
export function NavRowTrailing({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="nav-row-trailing"
			className={cn(
				"ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end gap-1.5 text-label font-normal tabular-nums text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}
