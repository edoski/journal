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

/** One labelled part of a problem with several ("(a)", "2)"), as the
 *  statement writes it: the posed topics it tests and how it went. */
export interface PartResult {
	part: string;
	topics: readonly string[];
	result: AttemptResult;
}

/** One graded answer: one response, so one result on each topic it is
 *  charged to (round 14, M2: "t = 4" was saved twice, incorrect on rank and
 *  correct on kernel, and Kernel gained false credit). Only a problem with
 *  labelled parts splits: each topic takes the result of the part that
 *  tests it (`parts`, round 8's per-part charging), and `result` is the
 *  whole answer's, partial when its parts went differently. */
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
	/** A problem with labelled parts that went differently: each part's
	 *  topics and result. A topic in no part takes `result`. */
	parts?: readonly PartResult[];
}

export interface PracticeConclusion extends Omit<GradedAnswer, "result"> {
	outcome: "solved" | "solvedWithHints" | "movedOn" | "surrendered";
	/** Null when he claimed no answer, as when he asked to be taught
	 *  instead: a request is not an attempt, so nothing is recorded. */
	result: AttemptResult | null;
	rung: Rung | null;
	/** His first unaided answer, when the problem took more than one and
	 *  that one did not solve it, with the confidence he gave that answer
	 *  (null when he gave none). */
	firstTry?: GradedAnswer & { sure: Confidence | null };
}

/** Each charged topic's result, in pose order, one per topic: the topic
 *  where it broke alone when it names one; else each topic the result of
 *  the part that tests it, or the answer's. A wrongly chosen method is
 *  never charged where the result is not correct, since a wrong choice is
 *  evidence on the topic that should have been chosen, even when both
 *  were posed. */
export function topicResults(topics: readonly string[], answer: GradedAnswer): [string, AttemptResult][] {
	if (answer.brokeAt !== undefined) return topics.filter((topic) => topic === answer.brokeAt).map((topic) => [topic, answer.result]);
	const results = topics.map((topic): [string, AttemptResult] => [topic, answer.parts?.find((p) => p.topics.includes(topic))?.result ?? answer.result]);
	if (!answer.chose || topics.length < 2) return results;
	return results.filter(([topic, result]) => topic !== answer.chose || result === "correct");
}

/** Why an answer gives one response a second result on a topic (round 14,
 *  M2), or null. `byTopic`, from before the rule, split even a one-part
 *  answer; only a problem's labelled parts split it now, each topic in one
 *  part. */
function secondResult(topics: readonly string[], answer: GradedAnswer, statement: string, label: string): string | null {
	if ("byTopic" in answer && (answer as { byTopic?: unknown }).byTopic !== undefined) {
		return `${label}byTopic gives one answer a second result, and one answer has one result: when the problem's labelled parts went differently, parts gives each part its topics and result; otherwise its result is partial on the posed topics, or brokeAt names the topic where it first broke`;
	}
	const parts = answer.parts;
	if (parts === undefined) return null;
	if (parts.length < 2) return `${label}parts splits a problem with several labelled parts; an answer to one part has one result, its result`;
	if (answer.brokeAt !== undefined) return `${label}parts already says how each part went, so brokeAt is left out`;
	const unlabelled = parts.find((p) => !p.part.trim() || !statement.includes(p.part.trim()));
	if (unlabelled) return `${label}parts names ${JSON.stringify(unlabelled.part)}, which the problem's statement does not label; a part is named as the statement writes it ("(a)", "2)"), and an answer to a problem with no labelled parts has one result`;
	const seen = new Set<string>();
	for (const p of parts) {
		const unknown = p.topics.filter((t) => !topics.includes(t));
		if (p.topics.length === 0 || unknown.length > 0) return `${label}parts ${JSON.stringify(p.part)} names ${unknown.length ? unknown.join(", ") : "no topic"}, and a part names the posed topics it tests`;
		const twice = p.topics.find((t) => seen.has(t));
		if (twice) return `${label}parts gives ${twice} a second result, and one answer has one result on each topic: name each topic in the one part that tests it`;
		for (const t of p.topics) seen.add(t);
	}
	const results = new Set(parts.map((p) => p.result));
	const whole = results.size === 1 ? [...results][0]! : "partial";
	if (answer.result !== whole) return `${label}result is the whole answer's: ${whole}, since its parts went ${[...results].join(" and ")}`;
	return null;
}
/** The part labels a problem's statement writes ("(a)", "(ii)", "2)"), in
 *  order, each once. */
export function statementParts(statement: string): string[] {
	const labels = statement.match(/\((?:[a-z]|[ivx]{1,4})\)|(?<![\w(])\d{1,2}\)/g) ?? [];
	return [...new Set(labels)];
}

function answerProblem(topics: readonly string[], answer: GradedAnswer, statement: string, label: string): string | null {
	const second = secondResult(topics, answer, statement, label);
	if (second) return second;
	// brokeAt charges one topic and credits none other: on a problem whose
	// labelled parts went differently, a part he got right would go
	// uncredited (round 15, m24: (c) dim ker right on his first try, yet
	// Kernel took nothing from it).
	if (answer.brokeAt !== undefined && answer.result === "partial" && topics.length > 1 && statementParts(statement).length > 1) {
		return `${label}brokeAt charges the miss to one topic and credits no other, but this problem's labelled parts went differently: give parts instead, each part as the statement labels it with the posed topics it tests and its result, so the part he got right credits its topic, and leave brokeAt out`;
	}
	if (answer.chose !== undefined && topicResults(topics, answer).every(([, r]) => r === "correct")) {
		return `${label}chose marks a wrongly chosen method, so the result is not correct on every topic`;
	}
	if (answer.brokeAt !== undefined) {
		if (!topics.includes(answer.brokeAt)) return `${label}brokeAt names ${answer.brokeAt}, which the problem was not posed with (its topics: ${topics.join(", ")})`;
		if (answer.result === "correct") return `${label}brokeAt marks where a failed answer broke, so the result is not correct`;
	}
	const uncharged = answer.result === "incorrect" && topics.length > 1 && answer.chose === undefined && answer.brokeAt === undefined && answer.parts === undefined;
	if (uncharged) {
		return `${label}an incorrect answer on a problem with several topics names brokeAt, the topic where it first broke, so the miss is charged to that topic alone (or its result is partial when some parts were right)`;
	}
	return null;
}

/** Why a conclusion cannot be recorded as given, or null when it can. A
 *  surrendered problem may still credit the parts answered before. */
export function conclusionProblem(c: PracticeConclusion, topics: readonly string[], statement = ""): string | null {
	if (c.outcome === "surrendered" && c.result !== "incorrect") return "a surrendered problem's result is incorrect";
	if (c.result === null) {
		return c.outcome === "movedOn" ? null : "a solved problem's result is correct or partial; only moving on with no answer claimed takes result null";
	}
	const answer = { ...c, result: c.result };
	if (c.outcome === "solved" || c.outcome === "solvedWithHints") {
		if (answer.result === "incorrect") return "a solved problem's result is correct or partial";
		const unsolved = (c.parts ?? []).filter((p) => p.result === "incorrect").map((p) => p.part);
		if (unsolved.length > 0) return `a solved problem is correct or partial on every part, but parts marks ${unsolved.join(", ")} incorrect`;
	}
	if (c.outcome === "solvedWithHints" && c.rung === null) return "solvedWithHints needs the rung of the strongest hint given";
	if (c.outcome === "solved" && c.rung !== null) return "a problem solved after a hint is solvedWithHints";
	return answerProblem(topics, answer, statement, "") ?? (c.firstTry ? answerProblem(topics, c.firstTry, statement, "firstTry.") : null);
}

/** One answer's observations: one per distinct result among its charged
 *  topics, so a part answered right is never charged with the part
 *  answered wrong, and no topic takes two results. An answer with no
 *  parts has one. */
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
		const gaveUp = marks.gave_up && result === "incorrect" ? { gave_up: true } : {};
		return { topics, text: answer.record?.trim() || pose.statement, response: answer.response, help, result, ...(chose ? { chose } : {}), ...(marks.sure ? { sure: marks.sure } : {}), ...(marks.shown ? { shown: true } : {}), ...gaveUp };
	});
}

function sameResults(topics: readonly string[], a: GradedAnswer, b: GradedAnswer): boolean {
	return a.chose === b.chose && JSON.stringify(topicResults(topics, a)) === JSON.stringify(topicResults(topics, b));
}

/** The observations a concluded problem adds to the course record: the
 *  first unaided try when it missed and differs from the final attempt
 *  (a right first try solved the problem, so it is the final answer
 *  itself: round 16, M2), then the
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
	if (!first || first.result === "correct" || (c.rung === null && sameResults(pose.topics, first, answer))) return final;
	return [...answerObservations(pose, first, "none", engineConfidence(first.sure ?? undefined)), ...final];
}
