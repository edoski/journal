/**
 * Round 14, M2 (4 major 2): one response was saved twice with opposite
 * results. In Rank practice "t = 4" became o51 (rank, incorrect, confident)
 * and o52 (kernel, correct, solid, confident): the conclude's first try
 * gave the answer a second result per topic (`byTopic`), and the save split
 * it into one observation per result. The chat showed two "First try"
 * rows, and Kernel gained false credit and a later review. One response is
 * one observation, with one result and a list of topics; the record tool
 * refuses a second result for the same response.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { answeredQuestionsOf, type LhMessage } from "../src/core/native-messages.ts";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";
import { practiceTools } from "../src/agent/tools/practice.ts";
import { answerMarksOf, markLinks } from "../src/core/answer-marks.ts";

const STAMPS = { api: "faux", provider: "test", model: "test-model", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "toolUse" } as const;

function answered(id: string): LhMessage[] {
	const assistant: LhMessage & AssistantMessage = { id: `a_${id}`, role: "assistant", content: [{ type: "toolCall", id, name: "explain", arguments: { type: "check", nodeId: "n", question: "For which t is rank A = 2?", correctAnswer: "t = 5" } as never }], timestamp: 1, ...STAMPS };
	const result = { id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: "explain", content: [{ type: "text", text: "t = 4" }], details: { kind: "explain", tool: "explain", questionText: "For which t is rank A = 2?", answers: [], answeredAt: "", text: "t = 4", confidence: "confident" }, isError: false, timestamp: 2 } as LhMessage & ToolResultMessage;
	return [assistant, result];
}

describe("one response, one observation (round 14, M2)", () => {
	it("a save naming one answer twice is refused, and saves nothing", async () => {
		const saves: unknown[] = [];
		const messages = answered("q1");
		const ctx = { course: { workspace: "/w", title: "LA" }, arcs: false, answers: answeredQuestionsOf(messages), records: { run: async (_w: string, v: { verb: string; changes?: unknown }) => (v.verb === "save" && saves.push(v.changes), { ok: true, json: { saved: ["o51", "o52"] } }) } } as unknown as CourseToolContext;
		const attempt = (topics: string[], result: string) => ({ question: "q1", topics, text: "Stopped elimination after column 1", response: "t = 4", help: "none", result });
		await assert.rejects(courseTools(ctx).course_save!.execute("s1", { changes: { observations: [attempt(["rank"], "incorrect"), attempt(["kernel"], "correct")] } } as never), /named by an earlier observation of this save, and one answer is one observation with one result/);
		assert.equal(saves.length, 0);
		await courseTools(ctx).course_save!.execute("s2", { changes: { observations: [attempt(["rank", "kernel"], "incorrect")] } } as never);
		assert.equal(saves.length, 1);
	});

	it("a concluded problem on two topics shows one row in the marks", async () => {
		const pose = { statement: "For which t is rank A = 2?", mode: "recall", topics: ["rank", "kernel"], modelSolution: "t = 5" };
		const messages = [{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "p1", name: "problem", arguments: pose }], stopReason: "toolUse", timestamp: 1 }, { id: "r1", role: "toolResult", toolCallId: "p1", toolName: "problem", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 2 }];
		const saves: { observations: unknown[] }[] = [];
		const records = { run: async (_w: string, req: { verb: string; changes?: unknown }) => (req.verb === "save" && saves.push(req.changes as never), { ok: true, json: { saved: (req.changes as { observations: unknown[] }).observations.map((_o, i) => `o${51 + i}`) } }) };
		const tools = practiceTools({ chatId: "c", chatStore: { getChat: () => ({ messages }) } as never }, { course: { workspace: "/w", title: "LA" }, records } as never);
		const result = await tools.conclude!.execute("c1", { outcome: "movedOn", verdict: "It broke at the rank.", rung: null, missClass: "execution", retest: true, result: "incorrect", response: "t = 4", record: "Stopped elimination after column 1", brokeAt: "rank" }, undefined);
		assert.notEqual(result.isError, true);
		assert.equal(saves[0]!.observations.length, 1);
		const transcript = [...messages, { id: "a2", role: "assistant", content: [{ type: "toolCall", id: "c1", name: "conclude", arguments: {} }], stopReason: "toolUse", timestamp: 3 }, { id: "r2", role: "toolResult", toolCallId: "c1", toolName: "conclude", content: result.content, isError: false, timestamp: 4 }] as unknown as LhMessage[];
		const links = markLinks({ messages: transcript });
		const marks = answerMarksOf(links, { o51: { kind: "attempt", topics: ["rank"], result: "incorrect", grade: "missed", help: "none", sure: "confident" } });
		assert.equal(marks.c1?.rows.length, 1);
	});

	it("a conclude that gives one answer a result per topic is refused", async () => {
		const pose = { statement: "For which t is rank A = 2?", mode: "recall", topics: ["rank", "kernel"], modelSolution: "t = 5" };
		const messages = [{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "p1", name: "problem", arguments: pose }], stopReason: "toolUse", timestamp: 1 }, { id: "r1", role: "toolResult", toolCallId: "p1", toolName: "problem", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 2 }];
		const saves: unknown[] = [];
		const records = { run: async (_w: string, req: unknown) => (saves.push(req), { ok: true, json: { saved: [] } }) };
		const tools = practiceTools({ chatId: "c", chatStore: { getChat: () => ({ messages }) } as never }, { course: { workspace: "/w", title: "LA" }, records } as never);
		const result = await tools.conclude!.execute("c1", { outcome: "solvedWithHints", verdict: "Right after a nudge.", rung: "R2", missClass: "execution", retest: true, result: "correct", response: "t = 5", firstTry: { result: "incorrect", response: "t = 4", sure: "confident", brokeAt: "rank", byTopic: { kernel: "correct" } } } as never, undefined);
		assert.match((result.content[0] as { text: string }).text, /one answer has one result/);
		assert.equal(saves.length, 0);
	});
});
