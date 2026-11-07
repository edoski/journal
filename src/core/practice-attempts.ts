/**
 * A concluded practice problem, as learning-engine observations. The only
 * engine vocabulary in the app's practice code: outcome and hint rung in,
 * `result` and `help` out. Grading, verdicts and scheduling stay in the
 * engine, which receives these observations through its `save` patch.
 */

import { engineConfidence } from "./engine-confidence.ts";

export type AttemptResult = "correct" | "partial" | "incorrect";

export type Rung = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";

/** The hint ladder's rungs in words: an observation's `help`. */
export const RUNG_HELP: Record<Rung, string> = {
	R0: "Hint R0: redirected his attention to the givens",
	R1: "Hint R1: re-described the pattern class",
	R2: "Hint R2: named the candidate class of ideas",
	R3: "Hint R3: named the idea to use",
	R4: "Hint R4: outlined the move",
	R5: "Hint R5: worked the step",
};

export interface PracticePose {
	statement: string;
	topics: readonly string[];
}

export interface PracticeConclusion {
	outcome: "solved" | "solvedWithHints" | "movedOn" | "surrendered";
	rung: Rung | null;
	result: AttemptResult;
	response: string;
	chose?: string;
	/** His first unaided answer, when the problem took more than one. */
	firstTry?: { result: AttemptResult; response: string };
}

/** The confidence states of his first and last submissions. */
export interface SubmissionConfidence {
	first?: string;
	last?: string;
}

/** Why a conclusion cannot be recorded as given, or null when it can. */
export function conclusionProblem(c: PracticeConclusion): string | null {
	if (c.outcome === "surrendered" && c.result !== "incorrect") return "a surrendered problem's result is incorrect";
	if ((c.outcome === "solved" || c.outcome === "solvedWithHints") && c.result === "incorrect") {
		return "a solved problem's result is correct or partial";
	}
	if (c.outcome === "solvedWithHints" && c.rung === null) return "solvedWithHints needs the rung of the strongest hint given";
	if (c.outcome === "solved" && c.rung !== null) return "a problem solved after a hint is solvedWithHints";
	if (c.chose !== undefined && c.result === "correct") return "chose marks a wrongly chosen method, so the result is not correct";
	return null;
}

/** The observations a concluded problem adds to the course record: the
 *  first unaided try when it differs from the final attempt, then the
 *  final attempt with the help given. */
export function practiceObservations(
	pose: PracticePose,
	c: PracticeConclusion,
	confidence: SubmissionConfidence,
): Record<string, unknown>[] {
	const final: Record<string, unknown> = {
		topics: [...pose.topics],
		text: pose.statement,
		response: c.response,
		help: c.rung ? RUNG_HELP[c.rung] : "none",
		result: c.result,
		...(c.chose ? { chose: c.chose } : {}),
		...engineConfidence(confidence.last),
	};
	const first = c.firstTry;
	if (!first || (c.rung === null && first.result === c.result)) return [final];
	return [
		{
			topics: [...pose.topics],
			text: pose.statement,
			response: first.response,
			help: "none",
			result: first.result,
			...engineConfidence(confidence.first),
		},
		final,
	];
}
