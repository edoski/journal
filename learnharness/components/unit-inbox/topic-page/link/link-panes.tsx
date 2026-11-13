import type { ReactNode } from "react";

/** What every way of tying the two panes takes: the list and the map, each already drawn. */
export interface PanesProps {
	side: ReactNode;
	map: ReactNode;
}

/** The two panes side by side, the list up to 24rem and the map filling the rest. */
export const PANES_GRID = "grid min-h-0 flex-1 grid-cols-[minmax(0,24rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]";

/** The panes as they are: two columns 24px apart, nothing between them. */
export function PlainPanes({ side, map }: PanesProps) {
	return (
		<div data-slot="topic-panes" className={`${PANES_GRID} gap-6`}>
			{side}
			{map}
		</div>
	);
}
