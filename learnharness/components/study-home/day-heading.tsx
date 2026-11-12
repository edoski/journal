import { longDay } from "@/components/study-home/study-facts";

/** A study home's title: "Today" and the engine's study day. `id` lets a
 *  section name itself after it. */
export function DayHeading({ today, id }: { today: string; id?: string }) {
	return (
		<h1 id={id} data-slot="day-heading" className="flex items-baseline gap-2.5">
			<span className="text-heading font-medium text-foreground">Today</span>
			<span className="text-row text-muted-foreground">{longDay(today)}</span>
		</h1>
	);
}
