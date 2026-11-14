/**
 * The record keeps what happened, whatever a save says (round 6): an
 * answer's prediction and its confidence come from the question he answered
 * and the meter he set, never from the tutor's reading of his words, and an
 * answer is saved once. Round 6 found a check of what was taught saved as a
 * prediction, "gut feeling" saved as a guess over his Confident, a
 * confidence he never chose on a re-marked answer, and, once an unreadable
 * course read again, a 4 Nov answer saved a second time, dated today.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";

import { CONCLUDE_ACK_TEXT } from "../src/core/contracts/chat.ts";
import { PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, answeredQuestionsOf, type LhMessage } from "../src/core/native-messages.ts";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "toolUse",
} as const;

let n = 0;
function call(name: string, args: Record<string, unknown>, result: { text?: string; isError?: boolean; details?: unknown } = {}): { id: string; messages: LhMessage[] } {
	n += 1;
	const id = `call_${n}`;
	const assistant: LhMessage & AssistantMessage = { id: `msg_a${n}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args as never }], timestamp: n, ...STAMPS };
	const done: LhMessage & ToolResultMessage = { id: `msg_r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: result.text ?? "ok" }], details: (result.details ?? null) as never, isError: result.isError ?? false, timestamp: n };
	return { id, messages: [assistant, done] };
}

/** A graded question asked and answered, as a prediction or a check. */
function asked(type: "predict" | "check", answer: Record<string, unknown> = { text: "rank 2" }, tool = "explain") {
	const question = `Question ${n + 1}`;
	return call(tool, { type, nodeId: "n", question, correctAnswer: "2" }, { details: { kind: "explain", tool, questionText: question, answers: [], answeredAt: "", ...answer } });
}

function said(text: string): LhMessage {
	n += 1;
	return { id: `msg_u${n}`, role: "user", content: [{ type: "text", text }], timestamp: n } as LhMessage & UserMessage;
}

const saved = (args: Record<string, unknown>, ok = true) => call("course_save", args, ok ? { text: JSON.stringify({ saved: ["o6"] }) } : { text: "The course record can't be read", isError: true });

const attempt = (extra: Record<string, unknown> = {}) => ({ topics: ["eigen"], text: "q", response: "a", help: "none", result: "correct", ...extra });

function savingCourse(messages: LhMessage[]) {
	const saves: { observations?: Record<string, unknown>[] }[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: "/study/la", title: "Linear Algebra" },
		records: {
			run: async (_w, verb) => {
				if (verb.verb === "save") saves.push(verb.changes as never);
				return { ok: true, json: { observations: ["o41"], saved: ["o41"], notes: [] } };
			},
		} as CourseToolContext["records"],
		arcs: false,
		answers: answeredQuestionsOf(messages),
	};
	return { saves, tools: courseTools(ctx) };
}

async function courseSave(tools: ReturnType<typeof courseTools>, observations: unknown[]): Promise<{ text: string; isError: boolean }> {
	try {
		const result = await tools.course_save!.execute("t1", { changes: { observations } } as never);
		return { text: (result.content[0] as { text: string }).text, isError: false };
	} catch (error) {
		return { text: (error as Error).message, isError: true };
	}
}

describe("a prediction is what he was asked to predict", () => {
	it("an answer to a check is saved as a check, even when the save calls it a prediction (round 6: a right reasoning check saved predicted)", async () => {
		const check = asked("check");
		const { saves, tools } = savingCourse(check.messages);
		await courseSave(tools, [attempt({ question: check.id, predicted: true })]);
		assert.equal("predicted" in saves[0]!.observations![0]!, false);
	});

	it("an answer to a prediction is saved predicted, and a probe's recall never is", async () => {
		const prediction = asked("predict");
		const recall = call("recall", { question: "Recall", correctAnswer: "2" }, { details: { kind: "explain", tool: "recall", questionText: "Recall", answers: [], answeredAt: "", text: "2" } });
		const { saves, tools } = savingCourse([...prediction.messages, ...recall.messages]);
		await courseSave(tools, [attempt({ question: prediction.id }), attempt({ question: recall.id, predicted: true })]);
		assert.equal(saves[0]!.observations![0]!.predicted, true);
		assert.equal("predicted" in saves[0]!.observations![1]!, false);
	});
});

describe("his confidence is the one he chose", () => {
	it("the meter wins over the tutor's reading of his words (round 6: 'gut feeling' saved as a guess over his Confident)", async () => {
		const check = asked("check", { text: "gut feeling: 2", confidence: "confident" });
		const { saves, tools } = savingCourse(check.messages);
		await courseSave(tools, [attempt({ question: check.id, sure: "guess" })]);
		assert.equal(saves[0]!.observations![0]!.sure, "confident");
	});

	it("an answer he set no confidence on is saved with none, whatever the save says (round 6: sure: confident on a re-mark)", async () => {
		const check = asked("check", { text: "2", confidence: "neutral" });
		const first = said("I'm sure it's 2");
		const { saves, tools } = savingCourse([...check.messages, first]);
		await courseSave(tools, [attempt({ question: check.id, sure: "confident", corrects: ["o5"] }), attempt({ question: "his-message", sure: "confident" })]);
		assert.equal("sure" in saves[0]!.observations![0]!, false);
		assert.equal("sure" in saves[0]!.observations![1]!, false, "a message carries no meter");
	});

	it("a guess he chose is saved as a guess", async () => {
		const check = asked("check", { text: "2", confidence: "guessing" });
		const { saves, tools } = savingCourse(check.messages);
		await courseSave(tools, [attempt({ question: check.id })]);
		assert.equal(saves[0]!.observations![0]!.sure, "guess");
	});
});

describe("an answer is saved once", () => {
	it("an answer a save already recorded is refused, naming the fix, and nothing is saved", async () => {
		const check = asked("check");
		const first = saved({ changes: { observations: [attempt({ question: check.id })] } });
		const { saves, tools } = savingCourse([...check.messages, ...first.messages]);
		const refused = await courseSave(tools, [attempt({ question: check.id })]);
		assert.equal(refused.isError, true);
		assert.match(refused.text, /observations\[0\]\.question: .* is already saved/);
		assert.equal(saves.length, 0);
	});

	it("an answer whose save failed is saved on the retry", async () => {
		const check = asked("check");
		const failed = saved({ changes: { observations: [attempt({ question: check.id })] } }, false);
		const { saves, tools } = savingCourse([...check.messages, ...failed.messages]);
		assert.equal((await courseSave(tools, [attempt({ question: check.id })])).isError, false);
		assert.equal(saves.length, 1);
	});

	it("once an unreadable course reads again, only the answer that was not saved is written (round 6: a 4 Nov answer saved again, dated today)", async () => {
		const pose = (statement: string) => call(PRACTICE_PROBLEM_TOOL, { statement, mode: "recall", topics: ["series"], modelSolution: "s" });
		const earlier = [...pose("Does $\\sum 1/n^2$ converge?").messages, ...call(PRACTICE_CONCLUDE_TOOL, { outcome: "solved", result: "correct", response: "r" }, { text: "Problem concluded." }).messages];
		const today = call(PRACTICE_CONCLUDE_TOOL, { outcome: "solved", result: "correct", response: "r" }, { text: `${CONCLUDE_ACK_TEXT}\n\nThe attempt was not saved (the course record can't be read). On your next turn, re-send exactly this with course_save: {}` });
		const asked = said("the course is readable again, can you save that answer now?");
		const messages = [...earlier, ...pose("Does $\\sum (\\sqrt{n+1}-\\sqrt n)/n$ converge?").messages, ...today.messages, asked];
		const earlierConclude = (earlier[2] as AssistantMessage).content[0] as { id: string };
		const { saves, tools } = savingCourse(messages);
		assert.equal((await courseSave(tools, [attempt({ question: today.id })])).isError, false);
		const again = await courseSave(tools, [attempt({ question: earlierConclude.id })]);
		assert.match(again.text, /is already saved/);
		const unnamed = await courseSave(tools, [attempt({ text: "Does $\\sum 1/n^2$ converge?" })]);
		assert.match(unnamed.text, /observations\[0\]: name the answer it records/);
		assert.equal(saves.length, 1);
	});

	it("the same answer twice in one turn is saved once", async () => {
		const check = asked("check");
		const { saves, tools } = savingCourse(check.messages);
		await courseSave(tools, [attempt({ question: check.id })]);
		assert.match((await courseSave(tools, [attempt({ question: check.id })])).text, /is already saved/);
		assert.equal(saves.length, 1);
	});

	it("a re-mark names what it corrects, and an exam or his own report names no answer", async () => {
		const check = asked("check");
		const first = saved({ changes: { observations: [attempt({ question: check.id })] } });
		const { saves, tools } = savingCourse([...check.messages, ...first.messages]);
		const ok = await courseSave(tools, [
			attempt({ corrects: ["o6"], disputed: "It was right", ruling: "It was" }),
			{ kind: "exam", topics: ["eigen"], text: "Midterm question 2", result: "correct" },
			{ kind: "self_report", topics: ["eigen"], text: "Says he practised eigenvectors" },
		]);
		assert.equal(ok.isError, false, ok.text);
		assert.equal(saves[0]!.observations!.length, 3);
	});
});
