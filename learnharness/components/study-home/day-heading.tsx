import { dayQuestion, nothingTodayWords, type NearExam } from "@/components/study-home/day-record";

/** A study home's title: one question that follows the time of day ("What
 *  are we studying this morning?"), never the date, asking what else once
 *  he has `studied` today, and for an exam in the coming week by its day.
 *  With nothing left on Today (`empty`) it says so instead of asking. `id`
 *  lets a section name itself after it. The home draws only in the browser,
 *  so the clock is the learner's. */
export function DayHeading({ id, studied = false, exam = null, empty = false }: { id?: string; studied?: boolean; exam?: NearExam | null; empty?: boolean }) {
	return (
		<h1 id={id} data-slot="day-heading" className="text-title-1 system-current:text-heading system-current:font-medium text-foreground">
			{empty ? nothingTodayWords(studied) : dayQuestion(new Date().getHours(), studied, exam)}
		</h1>
	);
}
