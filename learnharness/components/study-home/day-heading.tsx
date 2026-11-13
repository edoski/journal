import { studyQuestion } from "@/components/study-home/study-facts";

/** A study home's title: one question that follows the time of day ("What
 *  are we studying this morning?"), never the date. `id` lets a section
 *  name itself after it. The home draws only in the browser, so the clock
 *  is the learner's. */
export function DayHeading({ id }: { id?: string }) {
	return (
		<h1 id={id} data-slot="day-heading" className="text-heading font-medium text-foreground">
			{studyQuestion(new Date().getHours())}
		</h1>
	);
}
