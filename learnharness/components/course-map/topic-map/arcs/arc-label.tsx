import type { ArcHandle } from "@/src/core";
import { MathText } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";

/**
 * An arc named quietly on the map, where a chapter starts (Bands) or on
 * the arc rail (Stacked arcs): its place in study order, then its whole
 * name, both in the muted ink, never a pill (Edo, 16 Nov 2026: the pills
 * were "too in the way"). `here` brightens the name of the arc he is in.
 */
export function ArcLabel({ number, handle, title, here = false, className }: { number: number; handle: ArcHandle; title: string; here?: boolean; className?: string }) {
	return (
		<span data-slot="arc-label" data-arc={handle} className={cn("flex items-baseline gap-2 text-callout whitespace-nowrap text-muted-foreground", className)}>
			<span data-slot="arc-number" aria-hidden="true" className="tabular-nums">
				{number}
			</span>
			<span className={cn(here && "text-foreground")}>
				<MathText>{title}</MathText>
			</span>
		</span>
	);
}
