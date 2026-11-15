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
	/** A combined problem that failed: the topic where the answer first
	 *  broke. The miss is charged to it alone; the other posed topics are
	 *  charged only with what byTopic gives them. */
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

/** Each charged topic's result, in pose order. With `brokeAt`, a topic
 *  the answer never reached, or reached on the way to the break with no
 *  result of its own, is not charged. */
export function topicResults(topics: readonly string[], answer: GradedAnswer): [string, AttemptResult][] {
	if (answer.brokeAt !== undefined) {
		return topics.flatMap((topic): [string, AttemptResult][] => {
			if (topic === answer.brokeAt) return [[topic, answer.byTopic?.[topic] ?? answer.result]];
			const own = answer.byTopic?.[topic];
			return own ? [[topic, own]] : [];
		});
	}
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
	if (answer.brokeAt !== undefined) {
		if (!topics.includes(answer.brokeAt)) return `${label}brokeAt names ${answer.brokeAt}, which the problem was not posed with (its topics: ${topics.join(", ")})`;
		if (answer.result === "correct") return `${label}brokeAt marks where a failed answer broke, so the result is not correct`;
	}
	const uncharged = answer.result === "incorrect" && topics.length > 1 && answer.chose === undefined && answer.brokeAt === undefined;
	if (uncharged && Object.keys(answer.byTopic ?? {}).length === 0) {
		return `${label}an incorrect answer on a problem with several topics names brokeAt, the topic where it first broke, so the miss is charged to that topic alone (or byTopic splits the parts that went differently)`;
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
	if (c.outcome === "solved" || c.outcome === "solvedWithHints") {
		const unsolved = topicResults(topics, answer).filter(([, r]) => r === "incorrect").map(([t]) => t);
		if (unsolved.length > 0) {
			return answer.result === "incorrect"
				? "a solved problem's result is correct or partial"
				: `a solved problem is correct or partial on every topic, but byTopic marks ${unsolved.join(", ")} incorrect`;
		}
	}
	if (c.outcome === "solvedWithHints" && c.rung === null) return "solvedWithHints needs the rung of the strongest hint given";
	if (c.outcome === "solved" && c.rung !== null) return "a problem solved after a hint is solvedWithHints";
	return answerProblem(topics, answer, "") ?? (c.firstTry ? answerProblem(topics, c.firstTry, "firstTry.") : null);
}

/** One observation per distinct result among the posed topics, so a part
 *  answered right is never charged with the part answered wrong. */
function answerObservations(
	pose: PracticePose,
	answer: GradedAnswer,
	help: string,
	marks: { sure?: string; shown?: true; gave_up?: true },
): Record<string, unknown>[] {
	const groups = new Map<AttemptResult, string[]>();
	for (const [topic, result] of topicResults(pose.topics, answer)) groups.set(result, [...(groups.get(result) ?? []), topic]);
	return [...groups].map(([result, topics]) => {
		const chose = answer.chose && result !== "correct" ? answer.chose : undefined;
		// A wrong choice is evidence on the topic that should have been
		// chosen, never on the method chosen, even when both were posed.
		const charged = chose && topics.length > 1 ? topics.filter((t) => t !== chose) : topics;
		const gaveUp = marks.gave_up && result === "incorrect" ? { gave_up: true } : {};
		return { topics: charged, text: pose.statement, response: answer.response, help, result, ...(chose ? { chose } : {}), ...(marks.sure ? { sure: marks.sure } : {}), ...(marks.shown ? { shown: true } : {}), ...gaveUp };
	});
}

function sameResults(topics: readonly string[], a: GradedAnswer, b: GradedAnswer): boolean {
	const key = (answer: GradedAnswer) => JSON.stringify(topicResults(topics, answer));
	return a.chose === b.chose && key(a) === key(b);
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
	const final = answerObservations(pose, answer, c.rung ? RUNG_HELP[c.rung] : "none", marks);
	const first = c.firstTry;
	if (!first || (c.rung === null && sameResults(pose.topics, first, answer))) return final;
	return [...answerObservations(pose, first, "none", engineConfidence(first.sure ?? undefined)), ...final];
}
