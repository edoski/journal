import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The list up to 20rem on the left, the map filling the rest, 24px apart,
 *  both the full height. */
export const LINKED_GRID = "grid min-h-0 flex-1 grid-cols-[minmax(0,20rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-6";

/**
 * Two columns, a list beside a map, with nothing around them (spec:
 * linked-columns.md): the course page's topics beside its course map, the
 * topic page's history beside a lesson's step map.
 */
export function LinkedColumns({ list, map, className, ...rest }: { list: ReactNode; map: ReactNode } & Omit<ComponentProps<"div">, "children">) {
	return (
		<div className={cn(LINKED_GRID, className)} {...rest}>
			<div className="flex min-h-0 min-w-0 flex-col">{list}</div>
			<div className="relative flex min-h-0 min-w-0 flex-col">{map}</div>
		</div>
	);
}
