import type { ArcHandle } from "@/src/core";
import { ArcPill } from "@/components/course-map/arc-strip";

/**
 * An arc as the map names it (arcs.md): its place in study order, then its
 * pill (`ArcPill`, its ring and its whole name), so the order reads at a
 * glance, first to last, top to bottom.
 */
export function ArcMark({ number, handle, title, share }: { number: number; handle: ArcHandle; title: string; share: number | null }) {
	return (
		<span data-slot="arc-mark" data-arc={handle} className="flex min-w-0 items-center gap-2">
			<span data-slot="arc-number" aria-hidden="true" className="w-4 shrink-0 text-right text-callout font-medium text-muted-foreground tabular-nums">
				{number}
			</span>
			<ArcPill arc={{ handle, title, share }} size="segment-sm" />
		</span>
	);
}
