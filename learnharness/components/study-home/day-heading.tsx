import { dayQuestion } from "@/components/study-home/day-record";

/** A study home's title: one question that follows the time of day ("What
 *  are we studying this morning?"), never the date, asking what else once
 *  he has `studied` today. `id` lets a section name itself after it. The
 *  home draws only in the browser, so the clock is the learner's. */
export function DayHeading({ id, studied = false }: { id?: string; studied?: boolean }) {
	return (
		<h1 id={id} data-slot="day-heading" className="text-heading font-medium text-foreground">
			{dayQuestion(new Date().getHours(), studied)}
		</h1>
	);
}
