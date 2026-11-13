/**
 * How the tutor's last turn left a lesson. A lesson waits on him partway
 * through only when the tutor's last words ask him something (or the plan
 * waits for his go-ahead); a sign-off such as "Good place to stop" ends the
 * session there, even with plan steps still ahead.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionEndOf } from "../src/core/session-end.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";

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

	it("the plan waiting for his go-ahead waits on him", () => {
		assert.equal(sessionEndOf(lesson("Say go.").slice(0, 6), TREE), "mid-lesson");
	});
});
