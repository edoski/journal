import { cn } from "@/lib/utils";
import { marksSummary, type TopicMark } from "@/components/study-home/study-facts";

const BAND_FILL = {
	solid: "bg-foreground/75",
	learning: "bg-foreground/30",
	new: "bg-foreground/10",
} as const;

/**
 * A course's topics in path order, one segment each, so readiness reads at
 * a glance without a number (spec: topic-strip.md): solid ink for solid,
 * a lighter tint while learning, a faint one not started, and a
 * warning tick under a topic the engine calls weak. The segments are
 * drawn for the eye; a screen reader hears the band summary.
 */
export function TopicStrip({ marks, className }: { marks: readonly TopicMark[]; className?: string }) {
	return (
		<div data-slot="topic-strip" className={cn("flex flex-col gap-1", className)}>
			<span className="sr-only">{marksSummary(marks)}</span>
			<div aria-hidden="true" className="flex h-2 gap-0.5">
				{marks.map((m, i) => (
					<span key={i} className={cn("min-w-1 flex-1", BAND_FILL[m.band])} />
				))}
			</div>
			<div aria-hidden="true" className="flex h-0.5 gap-0.5">
				{marks.map((m, i) => (
					<span key={i} className={cn("min-w-1 flex-1", m.weak && "bg-warning")} />
				))}
			</div>
		</div>
	);
}
