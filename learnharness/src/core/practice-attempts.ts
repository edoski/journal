/**
 * A concluded practice problem, as learning-engine observations. The only
 * engine vocabulary in the app's practice code: outcome and hint rung in,
 * `result` and `help` out. Grading, verdicts and scheduling stay in the
 * engine, which receives these observations through its `save` patch.
 */

import type { Confidence } from "./contracts/course.ts";
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

/** One graded answer. `byTopic` gives the result of each posed topic that
 *  went differently from `result`; `chose` rides on the topics not correct. */
export interface GradedAnswer {
	result: AttemptResult;
	response: string;
	chose?: string;
	byTopic?: Readonly<Record<string, AttemptResult>>;
}

export interface PracticeConclusion extends GradedAnswer {
	outcome: "solved" | "solvedWithHints" | "movedOn" | "surrendered";
	rung: Rung | null;
	/** His first unaided answer, when the problem took more than one, with
	 *  the confidence he gave that answer (null when he gave none). */
	firstTry?: GradedAnswer & { sure: Confidence | null };
}

/** Each posed topic's result, in pose order. */
function topicResults(topics: readonly string[], answer: GradedAnswer): [string, AttemptResult][] {
	return topics.map((topic) => [topic, answer.byTopic?.[topic] ?? answer.result]);
}

function answerProblem(topics: readonly string[], answer: GradedAnswer, label: string): string | null {
	const unknown = Object.keys(answer.byTopic ?? {}).filter((t) => !topics.includes(t));
	if (unknown.length > 0) {
		return `${label}byTopic names ${unknown.join(", ")}, which the problem was not posed with (its topics: ${topics.join(", ")})`;
	}
	if (answer.chose !== undefined && topicResults(topics, answer).every(([, r]) => r === "correct")) {
		return `${label}chose marks a wrongly chosen method, so the result is not correct on every topic`;
	}
	return null;
}

/** Why a conclusion cannot be recorded as given, or null when it can. */
export function conclusionProblem(c: PracticeConclusion, topics: readonly string[]): string | null {
	const results = topicResults(topics, c).map(([, r]) => r);
	if (c.outcome === "surrendered" && results.some((r) => r !== "incorrect")) return "a surrendered problem's result is incorrect";
	if ((c.outcome === "solved" || c.outcome === "solvedWithHints") && results.includes("incorrect")) {
		return "a solved problem's result is correct or partial";
	}
	if (c.outcome === "solvedWithHints" && c.rung === null) return "solvedWithHints needs the rung of the strongest hint given";
	if (c.outcome === "solved" && c.rung !== null) return "a problem solved after a hint is solvedWithHints";
	return answerProblem(topics, c, "") ?? (c.firstTry ? answerProblem(topics, c.firstTry, "firstTry.") : null);
}

/** One observation per distinct result among the posed topics, so a part
 *  answered right is never charged with the part answered wrong. */
function answerObservations(
	pose: PracticePose,
	answer: GradedAnswer,
	help: string,
	sure: { sure?: string },
): Record<string, unknown>[] {
	const groups = new Map<AttemptResult, string[]>();
	for (const [topic, result] of topicResults(pose.topics, answer)) groups.set(result, [...(groups.get(result) ?? []), topic]);
	return [...groups].map(([result, topics]) => ({
		topics,
		text: pose.statement,
		response: answer.response,
		help,
		result,
		...(answer.chose && result !== "correct" ? { chose: answer.chose } : {}),
		...sure,
	}));
}

function sameResults(topics: readonly string[], a: GradedAnswer, b: GradedAnswer): boolean {
	const bResults = topicResults(topics, b);
	return a.chose === b.chose && topicResults(topics, a).every(([, r], i) => bResults[i]![1] === r);
}

/** The observations a concluded problem adds to the course record: the
 *  first unaided try when it differs from the final attempt, then the
 *  final attempt with the help given. `lastConfidence` is the state of his
 *  last submission, the one the final answer came with. */
export function practiceObservations(
	pose: PracticePose,
	c: PracticeConclusion,
	lastConfidence: string | undefined,
): Record<string, unknown>[] {
	const final = answerObservations(pose, c, c.rung ? RUNG_HELP[c.rung] : "none", engineConfidence(lastConfidence));
	const first = c.firstTry;
	if (!first || (c.rung === null && sameResults(pose.topics, first, c))) return final;
	return [...answerObservations(pose, first, "none", engineConfidence(first.sure ?? undefined)), ...final];
}
