import * as React from "react";
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/** The sidebar row (spec: nav-row.md): one 32px line, an optional 16px
 *  leading icon, the label, and a trailing slot for a time, a status or a
 *  glyph. Resting ink is muted; hover lifts the fill one step and the ink to
 *  full, the active row holds the selected fill. No weight change in any
 *  state, so nothing moves. */
const navRowVariants = cva(
	"relative flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-row text-muted-foreground outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			state: {
				rest: "",
				active: "bg-fill-selected text-foreground hover:bg-fill-selected",
				highlighted: "bg-fill-hover text-foreground",
			},
		},
		defaultVariants: { state: "rest" },
	},
);

export function NavRow({
	asChild = false,
	active = false,
	highlighted = false,
	className,
	...props
}: React.ComponentProps<"button"> & {
	/** Render the child element (a Link) as the row. */
	asChild?: boolean;
	/** The page this row opens is the one showing. */
	active?: boolean;
	/** The keyboard walk's current row (the search's ↑/↓). */
	highlighted?: boolean;
}) {
	const Comp = asChild ? Slot.Root : "button";
	return (
		<Comp
			data-slot="nav-row"
			data-active={active || undefined}
			aria-current={active ? "page" : undefined}
			{...(asChild ? {} : { type: "button" as const })}
			className={cn(navRowVariants({ state: active ? "active" : highlighted ? "highlighted" : "rest" }), className)}
			{...props}
		/>
	);
}

export function NavRowLabel({ className, ...props }: React.ComponentProps<"span">) {
	return <span data-slot="nav-row-label" className={cn("min-w-0 flex-1 truncate", className)} {...props} />;
}

/** The right column: 12px tabular figures in the row's own ink. */
export function NavRowTrailing({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="nav-row-trailing"
			className={cn("ml-auto flex shrink-0 items-center gap-1.5 text-label tabular-nums", className)}
			{...props}
		/>
	);
}
