import { cn } from "@/lib/utils";

/**
 * Where a wrapped path goes on from one column's last topic to the next
 * column's first (spec: map-course.md), one line along the route
 * `pathLinks` gives: drawn as the map draws a need (1px, white 33%). It
 * brightens with a lit chain that holds both topics and fades with one
 * that does not, as a need does. Inside the pane's overlay `svg`.
 */
export function PathLink({ d, state }: { d: string; state: "rest" | "on" | "off" }) {
	return (
		<path
			data-slot="course-map-path-link"
			d={d}
			fill="none"
			strokeWidth={1}
			strokeLinecap="round"
			className={cn(
				"transition-[stroke,opacity] duration-[120ms] motion-reduce:transition-none",
				state === "on" ? "stroke-white/70" : "stroke-white/33",
				state === "off" && "opacity-35",
			)}
		/>
	);
}
