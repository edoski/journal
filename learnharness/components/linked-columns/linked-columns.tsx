import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The list up to 24rem on the left, the map filling the rest, 24px apart,
 *  both the full height. The course page and the topic page share it, so
 *  their left columns are one width. */
export const LINKED_GRID = "grid min-h-0 flex-1 grid-cols-[minmax(0,24rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-6";

/**
 * Two columns, a list beside a map, with nothing around them (spec:
 * linked-columns.md): the course page's topics beside its course map, the
 * topic page's history beside a lesson's step map. `listHidden` gives the
 * map the whole width (the course page's map enlarged), keeping the list
 * drawn, so it returns as it was.
 */
export function LinkedColumns({ list, map, listHidden = false, className, ...rest }: { list: ReactNode; map: ReactNode; listHidden?: boolean } & Omit<ComponentProps<"div">, "children">) {
	return (
		<div className={cn(LINKED_GRID, listHidden && "grid-cols-[minmax(0,1fr)]", className)} {...rest}>
			<div hidden={listHidden} className="flex min-h-0 min-w-0 flex-col">{list}</div>
			<div className="relative flex min-h-0 min-w-0 flex-col">{map}</div>
		</div>
	);
}
