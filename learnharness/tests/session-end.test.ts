/**
 * How the tutor's last turn left a lesson. A lesson waits on him partway
 * through only when the tutor's last words ask him something (or it wrote
 * the plan but taught no step); a sign-off such as "Good place to stop" ends the
 * session there, even with plan steps still ahead.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionEndOf } from "../src/core/session-end.ts";
import { newDoneTonightMessage, newSessionModeMessage, newUserMessage, type LhMessage } from "../src/core/native-messages.ts";

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const assistant = (content: unknown[], stopReason: "stop" | "toolUse" = "toolUse") =>
	({ id: `a${++n}`, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: n }) as unknown as LhMessage;
const result = (toolCallId: string, toolName: string, details: unknown) =>
	({ id: `r${++n}`, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], details, isError: false, timestamp: n }) as unknown as LhMessage;
const call = (id: string, name: string, args: unknown) => ({ type: "toolCall", id, name, arguments: args });
const text = (t: string) => ({ type: "text", text: t });

const TREE = {
	nodes: [
		{ id: "rank-picture", title: "What rank means" },
		{ id: "rank-rule", title: "The rule" },
		{ id: "rank-own", title: "On your own" },
	],
	edges: [{ from: "rank-picture", to: "rank-rule" }, { from: "rank-rule", to: "rank-own" }],
	version: 1,
};

/** A lesson taught through its first step, then the tutor's last turn. */
const lesson = (last: string): LhMessage[] => [
	newUserMessage("Rank, please."),
	assistant([call("pd", "probe_done", { strands: [{ strand: "rank", assessment: "new" }], summary: "ready" })]),
	result("pd", "probe_done", { ok: true }),
	assistant([text("Three steps."), call("plan", "plan_init", { mermaid: "graph TD" })]),
	result("plan", "plan_init", { ok: true, tree: TREE }),
	assistant([text("Say go.")], "stop"),
	newUserMessage("Go."),
	assistant([call("q", "explain", { type: "check", nodeId: "rank-picture", question: "What does rank count?", correctAnswer: "Pivots." })]),
	result("q", "explain", { kind: "explain", text: "Pivots.", confidence: "confident" }),
	assistant([text(last)], "stop"),
];

describe("a lesson's tutor ends its turn in words, plan steps still ahead", () => {
	it("a sign-off ends the session", () => {
		assert.equal(sessionEndOf(lesson("Good place to stop. Practice comes next, in a day or two."), TREE), "closed");
	});

	it("a question in its words waits on him", () => {
		assert.equal(sessionEndOf(lesson("Right. So with rank 3 and 5 columns, how many free variables are there?"), TREE), "mid-lesson");
		assert.equal(sessionEndOf(lesson("Which pivot comes **first?**"), TREE), "mid-lesson", "past closing markup");
	});

	it("a plan written with no step taught waits on him", () => {
		assert.equal(sessionEndOf(lesson("Say go.").slice(0, 6), TREE), "mid-lesson");
	});
});

describe("a lesson the tutor moved to practice", () => {
	const practised = (done: string[]): LhMessage[] => [
		...lesson("Let's practise what we have so far."),
		...(done.length > 0 ? [assistant([call("lp", "lesson_progress", { done })]), result("lp", "lesson_progress", { ok: true })] : []),
		newSessionModeMessage("practice") as LhMessage,
		assistant([text("Solved. Press Next problem when you are ready.")], "stop"),
	];

	it("waits on him at Next problem while its plan has steps left", () => {
		assert.equal(sessionEndOf(practised([]), TREE), "mid-lesson");
	});

	it("ends with its plan done, and a practice round with no plan ends at its conclusion", () => {
		assert.equal(sessionEndOf(practised(["rank-picture", "rank-rule", "rank-own"]), TREE), "closed");
		assert.equal(sessionEndOf(practised([]), undefined), "closed");
	});
});

describe("a review left between problems", () => {
	const solve = (id: string, topics: string[], outcome: "solved" | "solvedWithHints", rest: Record<string, unknown> = {}): LhMessage[] => [
		assistant([call(`p_${id}`, "problem", { statement: "?", mode: "recall", topics, modelSolution: "!" })]),
		result(`p_${id}`, "problem", null),
		assistant([call(`c_${id}`, "conclude", { outcome, verdict: "ok", rung: outcome === "solved" ? null : "R1", missClass: null, retest: false, result: "correct", ...rest })]),
		result(`c_${id}`, "conclude", null),
		assistant([text("Good. Press Next problem when you are ready.")], "stop"),
	];
	const review = (...parts: LhMessage[][]): LhMessage[] => [newSessionModeMessage("practice") as LhMessage, newUserMessage("Review A, B"), ...parts.flat()];
	const next = { id: `n${++n}`, role: "custom", customType: "practice-next", content: "[NEXT PROBLEM]", display: true, details: {}, timestamp: n } as unknown as LhMessage;

	it("asks him nothing at Next problem, a topic it was opened on with no unaided solve or not (round 15, m7 and m8: Rank practice read \"Your turn\" with nothing asked)", () => {
		assert.equal(sessionEndOf(review(solve("1", ["a"], "solved")), undefined, "practice", ["a", "b"]), "closed");
		assert.equal(sessionEndOf(review(solve("1", ["a"], "solved"), solve("2", ["b"], "solvedWithHints")), undefined, "practice", ["a", "b"]), "closed");
		const dispute = { id: `d${++n}`, role: "custom", customType: "dispute", content: "[DISPUTE]", display: true, details: {}, timestamp: n } as unknown as LhMessage;
		assert.equal(sessionEndOf(review(solve("1", ["a"], "solved"), [dispute, assistant([text("The mark stands.")], "stop")]), undefined, "practice", ["a", "b"]), "closed", "after a dispute's ruling too");
	});

	it("is left for next time when he presses Done for today while a topic it was opened on has no unaided solve, and closed once each has one", () => {
		const done = (parts: LhMessage[][]) => [...review(...parts), newDoneTonightMessage("practice") as LhMessage, assistant([text("Your review of B goes on tomorrow.")], "stop")];
		assert.equal(sessionEndOf(done([solve("1", ["a"], "solved"), solve("2", ["b"], "solvedWithHints")]), undefined, "practice", ["a", "b"]), "left", "a hinted solve still owes the retest");
		assert.equal(sessionEndOf(done([solve("1", ["a"], "solved"), solve("2", ["b"], "solved")]), undefined, "practice", ["a", "b"]), "closed");
	});

	it("ends once every topic it was opened on was solved without a hint, or the tutor wrapped the round", () => {
		assert.equal(sessionEndOf(review(solve("1", ["a"], "solved"), solve("2", ["b"], "solved")), undefined, "practice", ["a", "b"]), "closed");
		assert.equal(sessionEndOf(review(solve("1", ["a"], "solved"), [next, assistant([text("That's the review done for today.")], "stop")]), undefined, "practice", ["a", "b"]), "closed");
	});

	it("a round opened on no topics is his to end", () => {
		assert.equal(sessionEndOf(review(solve("1", ["a"], "solvedWithHints")), undefined, "practice"), "closed");
	});
});

describe("Done for today on a session holding an open task (round 12, 1 m10)", () => {
	// 17 Nov: the session continued the Poisson lesson's task with no plan of its own, answered the chips question, and he pressed Done; the task stayed open.
	const continued = (task: unknown): LhMessage[] => [
		newUserMessage("Continue Poisson distribution lesson"),
		assistant([call("q17", "explain", { type: "check", question: "How many chips?", correctAnswer: "Poisson(2)" })]),
		result("q17", "explain", { kind: "explain", text: "Poisson(2)", confidence: "confident" }),
		assistant([call("s17", "course_save", { changes: { tasks: { "poisson-lesson": task } } })]),
		result("s17", "course_save", { ok: true }),
		assistant([text("Right.")], "stop"),
		newDoneTonightMessage("teacher") as LhMessage,
		assistant([text("Tomorrow you start Expectation and linearity. The help desk question in your Poisson distribution lesson is still open.")], "stop"),
	];

	it("leaves it for next time while the task stays open, and closes it once the task is finished", () => {
		assert.equal(sessionEndOf(continued({ title: "Poisson distribution lesson", step: "The help desk question" }), undefined), "left");
		assert.equal(sessionEndOf(continued(null), undefined), "closed");
	});
});
