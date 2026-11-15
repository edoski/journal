import * as React from "react";
import { cn } from "@/lib/utils";

/** A key or chord drawn the way macOS menus draw them (spec: kbd.md):
 *  plain system-font glyphs (⌘⇧F, Esc, ↵) in muted ink, no keycap box,
 *  each glyph its own fixed-width cell so chords line up in a column. */
export function Kbd({ className, children, ...props }: React.ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="kbd"
			className={cn("inline-flex shrink-0 items-center gap-px font-sans text-callout system-current:text-label tabular-nums text-muted-foreground", className)}
			{...props}
		>
			{children}
		</kbd>
	);
}
