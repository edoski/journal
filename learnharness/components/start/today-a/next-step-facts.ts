import type { CourseSummary } from "@/src/core";
import { byPriority, sentence, stepRequest, waitingOf, type Step } from "@/components/start/course-facts";

/** The one step Today leads with. */
export interface Lead {
	workspace: string;
	/** "Linear Algebra · Exam in 21 days". */
	caption: string;
	/** What the step is about: a topic or the task, by its title. */
	title: string;
	/** Why, in sentences; null when the engine gives nothing to add. */
	detail: string | null;
}

/** Another course, one line: "Review Conditional probability". */
export interface OtherCourse {
	workspace: string;
	course: string;
	line: string;
}

export interface NextStep {
	/** Null when no course has anything waiting. */
	lead: Lead | null;
	/** Every other course, in the same order. */
	others: OtherCourse[];
}

function leadWords(step: Step): Pick<Lead, "title" | "detail"> {
	switch (step.kind) {
		case "review": {
			const [first, second] = step.topics;
			// One more name at most: the lead is one topic, the rest are context.
			const also = second === undefined ? "" : step.due > 2 ? `, with ${second} and more` : `, with ${second}`;
			const gap = step.gap ? ` ${sentence(step.gap)}` : "";
			return { title: first!, detail: `Due for review${also}.${gap}` };
		}
		case "task":
			return { title: step.title, detail: step.step ? sentence(step.step) : null };
		case "topic":
			return { title: step.title, detail: "Next on your path." };
	}
}

/** Today's one next step: the first course by `byPriority` with anything
 *  waiting, at its first step; the rest one line each. Pure. */
export function nextStep(courses: readonly CourseSummary[]): NextStep {
	const waiting = byPriority(courses).map(waitingOf);
	const lead = waiting.find((w) => w.steps.length > 0);
	return {
		lead: lead
			? { workspace: lead.workspace, caption: lead.exam ? `${lead.course} · ${lead.exam}` : lead.course, ...leadWords(lead.steps[0]!) }
			: null,
		others: lead
			? waiting
					.filter((w) => w !== lead)
					.map((w) => ({ workspace: w.workspace, course: w.course, line: w.steps[0] ? stepRequest(w.steps[0]) : "Nothing waiting" }))
			: [],
	};
}
