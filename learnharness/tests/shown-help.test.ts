/**
 * An answer right after its solution was shown is saved as helped (Edo,
 * 14 Nov 2026), on the record's write path, whatever help the tutor wrote:
 * round 3 saw a rank answer that repeated the model solution shown one turn
 * earlier saved as unaided, which moved its review out two weeks.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";

import { PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, newPracticeRequestMessage, newThinkingMessage, shownTopicsOf, type LhMessage } from "../src/core/native-messages.ts";
import { SHOWN_HELP } from "../src/core/shown-help.ts";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";
import { concludeTool, createPracticeGate } from "../src/agent/tools/practice.ts";

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "toolUse",
} as const;

let n = 0;
function call(name: string, args: Record<string, unknown>, isError = false): LhMessage[] {
	n += 1;
	const id = `call_${n}`;
	const assistant: LhMessage & AssistantMessage = { id: `msg_a${n}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args as never }], timestamp: n, ...STAMPS };
	const result: LhMessage & ToolResultMessage = { id: `msg_r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "ok" }], details: null, isError, timestamp: n };
	return [assistant, result];
}

const pose = (topics: string[]) => call(PRACTICE_PROBLEM_TOOL, { statement: "Find the rank of $A$.", mode: "recall", topics, modelSolution: "Row 3 is row 1 plus row 2, so rank 2." });
const conclude = (args: Record<string, unknown>) => call(PRACTICE_CONCLUDE_TOOL, { verdict: "v", rung: null, missClass: null, retest: false, response: "r", ...args });
const save = (observations: unknown[], isError = false) => call("course_save", { changes: { observations } }, isError);
const attempt = (topics: string[], result: string, help = "none") => ({ kind: "attempt", topics, text: "q", response: "a", help, result });

function savingCourse(shown: Iterable<string> = []) {
	const saves: { observations?: Record<string, unknown>[] }[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: "/study/la", title: "Linear Algebra" },
		records: {
			run: async (_w, verb) => {
				if (verb.verb === "save") saves.push(verb.changes as never);
				return { ok: true, json: { observations: ["o41"], notes: [] } };
			},
		} as CourseToolContext["records"],
		arcs: false,
		shown: { topics: new Set(shown) },
	};
	return { ctx, saves, tools: courseTools(ctx) };
}

async function courseSave(tools: ReturnType<typeof courseTools>, observations: unknown[]): Promise<string> {
	const result = await tools.course_save!.execute("t1", { changes: { observations } } as never);
	return (result.content[0] as { text: string }).text;
}

describe("which topics a session has shown the solution of", () => {
	it("Explain instead before any answer shows the problem's solution", () => {
		assert.deepEqual([...shownTopicsOf([...pose(["rank"]), ...conclude({ outcome: "movedOn", result: null })])], ["rank"]);
	});

	it("Show me and a wrong or partial ending show it; a right one does not", () => {
		assert.deepEqual([...shownTopicsOf([...pose(["rank"]), ...conclude({ outcome: "surrendered", result: "incorrect" })])], ["rank"]);
		assert.deepEqual([...shownTopicsOf([...pose(["rank"]), ...conclude({ outcome: "solved", result: "partial" })])], ["rank"]);
		assert.deepEqual([...shownTopicsOf([...pose(["rank"]), ...conclude({ outcome: "solved", result: "correct" })])], []);
	});

	it("a lesson answer not right shows its answer, and his next answer on the topic clears it", () => {
		assert.deepEqual([...shownTopicsOf(save([attempt(["eigen"], "partial")]))], ["eigen"]);
		assert.deepEqual([...shownTopicsOf([...save([attempt(["eigen"], "partial")]), ...save([attempt(["eigen"], "correct", SHOWN_HELP)])])], []);
	});

	it("a dismissal for today, a refused save and a refused conclusion show nothing", () => {
		assert.deepEqual([...shownTopicsOf([...pose(["rank"]), ...call(PRACTICE_CONCLUDE_TOOL, { outcome: "dismissed" })])], []);
		assert.deepEqual([...shownTopicsOf(save([attempt(["eigen"], "incorrect")], true))], []);
		assert.deepEqual([...shownTopicsOf([...pose(["rank"]), ...call(PRACTICE_CONCLUDE_TOOL, { outcome: "movedOn", result: null }, true)])], []);
	});
});

describe("saving an answer given right after its solution was shown", () => {
	it("an answer saved as unaided is saved helped, with the shown mark, and the receipt says so", async () => {
		const { saves, tools } = savingCourse(["rank"]);
		const text = await courseSave(tools, [attempt(["rank"], "correct")]);
		assert.equal(saves[0]!.observations![0]!.help, SHOWN_HELP);
		assert.equal(saves[0]!.observations![0]!.shown, true);
		assert.match(text, /rank: saved as helped, since its solution was shown just before this answer/);
	});

	it("only the next answer on the topic: the one after it is his own again", async () => {
		const { saves, tools } = savingCourse(["rank"]);
		await courseSave(tools, [attempt(["rank"], "correct")]);
		await courseSave(tools, [attempt(["rank"], "correct")]);
		assert.equal(saves[1]!.observations![0]!.help, "none");
	});

	it("help the tutor named stays, and another topic's answer is untouched", async () => {
		const { saves, tools } = savingCourse(["rank"]);
		await courseSave(tools, [attempt(["rank"], "correct", "Hint R1: re-described the pattern class"), attempt(["eigen"], "correct")]);
		assert.equal(saves[0]!.observations![0]!.help, "Hint R1: re-described the pattern class");
		assert.equal(saves[0]!.observations![1]!.help, "none");
	});

	it("a wrong answer earlier in the turn makes the next one on its topic helped", async () => {
		const { saves, tools } = savingCourse();
		await courseSave(tools, [attempt(["eigen"], "incorrect")]);
		await courseSave(tools, [attempt(["eigen"], "correct")]);
		assert.equal(saves[0]!.observations![0]!.help, "none");
		assert.equal(saves[1]!.observations![0]!.help, SHOWN_HELP);
	});

	it("a practice problem solved right after Explain instead on the last one is saved helped", async () => {
		const { ctx, saves } = savingCourse();
		const lastId = (messages: LhMessage[]) => ((messages.findLast((m) => m.role === "assistant") as AssistantMessage).content[0] as { id: string }).id;
		const concludeOn = (messages: LhMessage[], args: Record<string, unknown>) => {
			const practice = { chatId: "c1", chatStore: { getChat: () => ({ messages, kind: "practice" }) } };
			return concludeTool(createPracticeGate(practice), { ctx: practice, course: ctx }).execute("k", { verdict: "v", rung: null, missClass: null, retest: false, response: "r", ...args } as never);
		};
		const explained = [...pose(["rank"])];
		explained.push(newPracticeRequestMessage(lastId(explained), "explain"));
		await concludeOn(explained, { outcome: "movedOn", result: null });
		assert.equal(saves.length, 0);

		const next = [...explained, ...conclude({ outcome: "movedOn", result: null }), ...pose(["rank"])];
		next.push(newThinkingMessage(lastId(next), "Row 3 = row 1 + row 2, so rank 2", "neutral"));
		await concludeOn(next, { outcome: "solved", result: "correct" });
		assert.equal(saves[0]!.observations![0]!.help, SHOWN_HELP);
	});
});
