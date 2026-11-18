import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * A page that fills the window under its 52px band (spec: page-frame.md,
 * "The window's band"): Home, the course page, a topic page, the calendar
 * and the start screen. The band is the window's drag region in the Mac
 * app, first in the page's DOM since Electron resolves its drag mask in
 * DOM order. It paints under the page (`-z-10` in the page's own stacking
 * context), so it never takes a click from a control drawn in it: round
 * 15, 2 D1, it covered the course head's Mistakes and Context, which a
 * mouse could not press. A control in the band also marks itself
 * `lh-no-drag`, so the Mac app hands it the click instead of dragging.
 */
export function WindowPage({ className, children, ...rest }: ComponentProps<"div">) {
	return (
		<div className={cn("relative isolate flex h-dvh min-w-0 flex-col", className)} {...rest}>
			<div data-slot="window-band" className="lh-drag absolute inset-x-0 top-0 -z-10 h-13" aria-hidden="true" />
			{children}
		</div>
	);
}
