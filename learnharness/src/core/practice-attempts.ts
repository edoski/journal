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

/** One graded answer: one response, so one result on the topics it is
 *  charged to (round 14, M2: "t = 4" was saved twice, incorrect on rank and
 *  correct on kernel, and Kernel gained false credit). A part answered
 *  right beside a part answered wrong makes the answer partial. */
export interface GradedAnswer {
	result: AttemptResult;
	response: string;
	/** The tutor's one line on what he did, the record's text as a lesson
	 *  save writes it ("Subtracted the rank from the rows"); the problem
	 *  stands in when absent. */
	record?: string;
	chose?: string;
	/** A combined problem that failed: the topic where the answer first
	 *  broke. The miss is charged to it alone. */
	brokeAt?: string;
}

export interface PracticeConclusion extends Omit<GradedAnswer, "result"> {
	outcome: "solved" | "solvedWithHints" | "movedOn" | "surrendered";
	/** Null when he claimed no answer, as when he asked to be taught
	 *  instead: a request is not an attempt, so nothing is recorded. */
	result: AttemptResult | null;
	rung: Rung | null;
	/** His first unaided answer, when the problem took more than one, with
	 *  the confidence he gave that answer (null when he gave none). */
	firstTry?: GradedAnswer & { sure: Confidence | null };
}

/** The topics an answer is charged to, in pose order: the topic where it
 *  broke when it names one, else every posed topic but a wrongly chosen
 *  method, since a wrong choice is evidence on the topic that should have
 *  been chosen, never on the method chosen, even when both were posed. */
export function chargedTopics(topics: readonly string[], answer: GradedAnswer): string[] {
	if (answer.brokeAt !== undefined) return topics.filter((topic) => topic === answer.brokeAt);
	const chose = answer.chose && answer.result !== "correct" ? answer.chose : undefined;
	return chose && topics.length > 1 ? topics.filter((t) => t !== chose) : [...topics];
}

/** Why an answer gives one response more than one result (round 14, M2),
 *  or null. A conclusion from before the rule may still carry `byTopic`. */
function secondResult(answer: object, label: string): string | null {
	return "byTopic" in answer && answer.byTopic !== undefined
		? `${label}byTopic gives one answer a second result, and one answer has one result: when some parts were right and others not, its result is partial on the posed topics, or brokeAt names the topic where it first broke`
		: null;
}

function answerProblem(topics: readonly string[], answer: GradedAnswer, label: string): string | null {
	const second = secondResult(answer, label);
	if (second) return second;
	if (answer.chose !== undefined && answer.result === "correct") {
		return `${label}chose marks a wrongly chosen method, so the result is not correct on every topic`;
	}
	if (answer.brokeAt !== undefined) {
		if (!topics.includes(answer.brokeAt)) return `${label}brokeAt names ${answer.brokeAt}, which the problem was not posed with (its topics: ${topics.join(", ")})`;
		if (answer.result === "correct") return `${label}brokeAt marks where a failed answer broke, so the result is not correct`;
	}
	const uncharged = answer.result === "incorrect" && topics.length > 1 && answer.chose === undefined && answer.brokeAt === undefined;
	if (uncharged) {
		return `${label}an incorrect answer on a problem with several topics names brokeAt, the topic where it first broke, so the miss is charged to that topic alone (or its result is partial when some parts were right)`;
	}
	return null;
}

/** Why a conclusion cannot be recorded as given, or null when it can. A
 *  surrendered problem may still credit the parts answered before. */
export function conclusionProblem(c: PracticeConclusion, topics: readonly string[]): string | null {
	if (c.outcome === "surrendered" && c.result !== "incorrect") return "a surrendered problem's result is incorrect";
	if (c.result === null) {
		return c.outcome === "movedOn" ? null : "a solved problem's result is correct or partial; only moving on with no answer claimed takes result null";
	}
	const answer = { ...c, result: c.result };
	if ((c.outcome === "solved" || c.outcome === "solvedWithHints") && answer.result === "incorrect") return "a solved problem's result is correct or partial";
	if (c.outcome === "solvedWithHints" && c.rung === null) return "solvedWithHints needs the rung of the strongest hint given";
	if (c.outcome === "solved" && c.rung !== null) return "a problem solved after a hint is solvedWithHints";
	return answerProblem(topics, answer, "") ?? (c.firstTry ? answerProblem(topics, c.firstTry, "firstTry.") : null);
}

/** One answer's observation: one response, one result, on the topics it
 *  is charged to. */
function answerObservation(
	pose: PracticePose,
	answer: GradedAnswer,
	help: string,
	marks: { sure?: string; shown?: true; gave_up?: true },
): Record<string, unknown> {
	const chose = answer.chose && answer.result !== "correct" ? answer.chose : undefined;
	const gaveUp = marks.gave_up && answer.result === "incorrect" ? { gave_up: true } : {};
	return { topics: chargedTopics(pose.topics, answer), text: answer.record?.trim() || pose.statement, response: answer.response, help, result: answer.result, ...(chose ? { chose } : {}), ...(marks.sure ? { sure: marks.sure } : {}), ...(marks.shown ? { shown: true } : {}), ...gaveUp };
}

function sameResults(topics: readonly string[], a: GradedAnswer, b: GradedAnswer): boolean {
	return a.chose === b.chose && a.result === b.result && JSON.stringify(chargedTopics(topics, a)) === JSON.stringify(chargedTopics(topics, b));
}

/** The observations a concluded problem adds to the course record: the
 *  first unaided try when it differs from the final attempt, then the
 *  final attempt with the help given, marked shown when the step was
 *  worked for him and given up when he surrendered; nothing when he
 *  claimed no answer. `lastConfidence` is the state of his last
 *  submission, the one the final answer came with. */
export function practiceObservations(
	pose: PracticePose,
	c: PracticeConclusion,
	lastConfidence: string | undefined,
): Record<string, unknown>[] {
	if (c.result === null) return [];
	const answer = { ...c, result: c.result };
	const marks = { ...engineConfidence(lastConfidence), ...(c.rung === "R5" ? { shown: true as const } : {}), ...(c.outcome === "surrendered" ? { gave_up: true as const } : {}) };
	const final = answerObservation(pose, answer, c.rung ? RUNG_HELP[c.rung] : "none", marks);
	const first = c.firstTry;
	if (!first || (c.rung === null && sameResults(pose.topics, first, answer))) return [final];
	return [answerObservation(pose, first, "none", engineConfidence(first.sure ?? undefined)), final];
}
