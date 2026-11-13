/**
 * The tutor's turn moves the lesson map: steps it taught are marked done
 * whether or not a check was tagged to them, and its close reads as
 * finished for tonight, not "Your turn".
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxText } from "@earendil-works/pi-ai";

import { derivePlanStatusesLh, LESSON_PROGRESS_TOOL, type PlanTree } from "../src/core/contracts/plan.ts";
import { sessionEndOf } from "../src/core/session-end.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { sessionState } from "../components/nav/session-state.ts";
import { planTools } from "../src/agent/tools/plan.ts";
import type { ChatListItem } from "../src/core/contracts/chat.ts";

const TREE: PlanTree = {
	nodes: ["map", "eigen-def", "char-poly", "spectrum-2x2", "eigenspace", "diagonalize"].map((id) => ({ id, title: id })),
	edges: [["map", "eigen-def"], ["eigen-def", "char-poly"], ["char-poly", "spectrum-2x2"], ["spectrum-2x2", "eigenspace"], ["eigenspace", "diagonalize"]].map(([from, to]) => ({ from: from!, to: to! })),
	version: 1,
};

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const assistant = (content: unknown[], stopReason: "stop" | "toolUse" = "toolUse") =>
	({ id: `a${++n}`, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: n }) as unknown as LhMessage;
const result = (toolCallId: string, toolName: string, details: unknown) =>
	({ id: `r${++n}`, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], details, isError: false, timestamp: n }) as unknown as LhMessage;
const call = (id: string, name: string, args: unknown) => ({ type: "toolCall", id, name, arguments: args });
const check = (id: string, nodeId: string) => [
	assistant([call(id, "explain", { type: "check", nodeId, question: "?", correctAnswer: "!" })]),
	result(id, "explain", { kind: "explain", text: "answer", confidence: "neutral", questionText: "?", answers: [], answeredAt: "2026-11-08T20:00:00Z" }),
];
const progress = (id: string, args: { done: string[]; close?: boolean }) => [assistant([call(id, LESSON_PROGRESS_TOOL, args)]), result(id, LESSON_PROGRESS_TOOL, { ok: true })];

/** The evaluated evening: the plan presented and accepted, then checks
 *  tagged only to char-poly and spectrum-2x2, while map and eigen-def were
 *  taught in prose. */
function evening(): LhMessage[] {
	return [
		newUserMessage("Eigenvalues tonight."),
		assistant([call("pd", "probe_done", { strands: [], summary: "ready" })]),
		result("pd", "probe_done", { ok: true }),
		assistant([fauxText("The plan."), call("plan", "plan_init", { mermaid: "graph TD" })]),
		result("plan", "plan_init", { ok: true, tree: TREE }),
		assistant([fauxText("Say go.")], "stop"),
		newUserMessage("Go."),
		...check("q1", "char-poly"),
		...check("q2", "spectrum-2x2"),
	];
}

const listItem = (messages: LhMessage[]) =>
	({ id: "chat_eigen", title: "Eigenvalues", kind: "teach", busy: false, compacting: false, pendingQuestion: null, pendingProblem: null, ended: sessionEndOf(messages, TREE) }) as unknown as ChatListItem;

describe("steps the tutor's turn marks done", () => {
	it("show as done on the map even with no check tagged to them", () => {
		const before = derivePlanStatusesLh(TREE, evening());
		assert.deepEqual([...before.visited], ["char-poly"], "only the tagged step before the current one counted");
		const marked = derivePlanStatusesLh(TREE, [...evening(), ...progress("p1", { done: ["map", "eigen-def"] })]);
		assert.deepEqual(new Set(marked.visited), new Set(["char-poly", "map", "eigen-def"]));
		assert.equal(marked.current, "spectrum-2x2");
	});

	it("a finished current step stops being current", () => {
		const marked = derivePlanStatusesLh(TREE, [...evening(), ...progress("p1", { done: ["spectrum-2x2"] })]);
		assert.equal(marked.current, null);
		assert.ok(marked.visited.has("spectrum-2x2"));
	});

	it("the tool refuses ids that are not steps of this session's plan", async () => {
		const tool = planTools({ chatId: "c1", chatStore: { getChat: () => ({ tree: TREE, messages: [] }) } as never })[LESSON_PROGRESS_TOOL]!;
		const refused = await tool.execute("t1", { done: ["eigenvalues"] });
		assert.match(JSON.stringify(refused.content), /Not node ids of this session's plan: eigenvalues/);
		const ok = await tool.execute("t2", { done: ["map"] });
		assert.match((ok.content[0] as { text: string }).text, /"ok":true/);
	});
});

describe("closing for tonight", () => {
	const closing = assistant([fauxText("Good place to stop. Next session: diagonalization.")], "stop");

	it("without a close, a lesson stopped partway still waits on him", () => {
		assert.equal(sessionState(listItem([...evening(), closing])), "your-turn");
	});

	it("the tutor's close reads as finished on every surface's state", () => {
		const closed = [...evening(), ...progress("p1", { done: ["spectrum-2x2"], close: true }), closing];
		assert.equal(sessionEndOf(closed, TREE), "closed");
		assert.equal(sessionState(listItem(closed)), "finished");
	});

	it("his next message reopens the session", () => {
		const reopened = [...evening(), ...progress("p1", { done: [], close: true }), closing, newUserMessage("Actually, one more question."), assistant([fauxText("Sure, ask away.")], "stop")];
		assert.notEqual(sessionEndOf(reopened, TREE), "closed");
	});
});
