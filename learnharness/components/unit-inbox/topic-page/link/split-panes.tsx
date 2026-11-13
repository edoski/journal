import { PANES_GRID, type PanesProps } from "@/components/unit-inbox/topic-page/link/link-panes";

/**
 * Link option "split" (spec: link.md): both panes in one bounded surface,
 * as Mail or Linear draw a list beside its detail. A hairline divides
 * them, and the selected row's fill runs flush to it (`in-data-[link=split]`
 * on the rows), so the map reads as that row's detail. The surface reaches
 * 12px past the column, so the rows' icons keep the head's edge.
 */
export function SplitPanes({ side, map }: PanesProps) {
	return (
		<div data-slot="topic-panes" data-link="split" className={`${PANES_GRID} -mx-3 overflow-hidden rounded-xl border border-border/60`}>
			<div className="flex min-h-0 flex-col border-r border-border/60 px-3 pt-1">{side}</div>
			{map}
		</div>
	);
}
