/**
 * An answer to a question whose solution he had already seen is saved as
 * helped (Edo, 14 Nov 2026), on the record's write path, whatever help the
 * tutor wrote: round 3 saw a rank answer that repeated the model solution
 * shown one turn earlier saved as unaided. The rule keys on the question:
 * round 4 saw a cold answer to a new question on the same topic saved as
 * helped.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";

import { PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, answeredQuestionsOf, newPracticeRequestMessage, newThinkingMessage, type LhMessage } from "../src/core/native-messages.ts";
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

const pose = (topics: string[], statement = "Find the rank of $A$.") => call(PRACTICE_PROBLEM_TOOL, { statement, mode: "recall", topics, modelSolution: "Row 3 is row 1 plus row 2, so rank 2." });
const conclude = (args: Record<string, unknown>) => call(PRACTICE_CONCLUDE_TOOL, { verdict: "v", rung: null, missClass: null, retest: false, response: "r", ...args });
const attempt = (topics: string[], result: string, help = "none", extra: Record<string, unknown> = {}) => ({ kind: "attempt", topics, text: "q", response: "a", help, result, ...extra });

/** A graded question asked and answered: its call and his answer. */
function asked(question: string, answer: Record<string, unknown> = { text: "rank 2", confidence: "neutral" }, tool = "explain"): { id: string; messages: LhMessage[] } {
	const [assistant, result] = call(tool, { type: "check", nodeId: "n", question, correctAnswer: "2" });
	const id = (result as ToolResultMessage).toolCallId;
	return { id, messages: [assistant!, { ...(result as LhMessage & ToolResultMessage), details: { kind: "explain", tool, questionText: question, answers: [], answeredAt: "", ...answer } } as LhMessage] };
}

function savingCourse(messages: LhMessage[] = []) {
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
		answers: answeredQuestionsOf(messages),
	};
	return { ctx, saves, tools: courseTools(ctx) };
}

async function courseSave(tools: ReturnType<typeof courseTools>, observations: unknown[]): Promise<{ text: string; isError: boolean }> {
	try {
		const result = await tools.course_save!.execute("t1", { changes: { observations } } as never);
		return { text: (result.content[0] as { text: string }).text, isError: false };
	} catch (error) {
		return { text: (error as Error).message, isError: true };
	}
}

describe("which questions he answered, and whether he had seen their solution first", () => {
	it("a new question on the same topic is unseen, however the last one went (round 4's cold answer saved as helped)", () => {
		const first = asked("Run BFS from $s$ and give every dist.");
		const second = asked("Explain why no path to $e$ is shorter than 3.");
		const answers = answeredQuestionsOf([...first.messages, ...second.messages]);
		assert.deepEqual(answers.get(first.id), { tool: "explain", seenBefore: false, predicted: false, confidence: null, asked: "Run BFS from $s$ and give every dist.", recorded: false });
		assert.deepEqual(answers.get(second.id), { tool: "explain", seenBefore: false, predicted: false, confidence: null, asked: "Explain why no path to $e$ is shorter than 3.", recorded: false });
	});

	it("the same words asked again after he answered them were seen", () => {
		const first = asked("What is the rank of $A$?");
		const again = asked("What is  the rank of $A$? ");
		assert.equal(answeredQuestionsOf([...first.messages, ...again.messages]).get(again.id)?.seenBefore, true);
	});

	it("a Hint press and a question left for today reveal nothing and are no answer", () => {
		const hinted = asked("What is the rank of $A$?", { hintRequested: true });
		const left = asked("What is the rank of $A$?", { dismissed: true });
		const again = asked("What is the rank of $A$?");
		const answers = answeredQuestionsOf([...hinted.messages, ...left.messages, ...again.messages]);
		assert.equal(answers.has(hinted.id), false);
		assert.equal(answers.has(left.id), false);
		assert.equal(answers.get(again.id)?.seenBefore, false);
	});

	it("a problem that ended shows its solution, a problem left for today does not; its conclude is the answer", () => {
		const ended = [...pose(["rank"]), ...conclude({ outcome: "movedOn", result: null })];
		const concludeId = (ended[2] as AssistantMessage).content[0] as { id: string };
		const again = pose(["rank"]);
		const solved = conclude({ outcome: "solved", result: "correct" });
		const answers = answeredQuestionsOf([...ended, ...again, ...solved]);
		assert.deepEqual(answers.get(concludeId.id), { tool: PRACTICE_CONCLUDE_TOOL, seenBefore: false, predicted: false, recorded: true });
		assert.equal([...answers.values()].at(-1)?.seenBefore, true);
		const dismissed = answeredQuestionsOf([...pose(["rank"]), ...call(PRACTICE_CONCLUDE_TOOL, { outcome: "dismissed" }), ...pose(["rank"]), ...solved]);
		assert.equal([...dismissed.values()].at(-1)?.seenBefore, false);
	});
});

describe("saving an answer to a question whose solution he had seen", () => {
	it("an answer to the same question asked again, saved as unaided, is saved helped and the receipt says so", async () => {
		const first = asked("What is the rank of $A$?");
		const again = asked("What is the rank of $A$?");
		const { saves, tools } = savingCourse([...first.messages, ...again.messages]);
		const { text } = await courseSave(tools, [attempt(["rank"], "correct", "none", { question: again.id })]);
		assert.equal(saves[0]!.observations![0]!.help, SHOWN_HELP);
		assert.equal(saves[0]!.observations![0]!.shown, true);
		assert.match(text, /rank: saved as helped, since its solution was shown just before this answer/);
	});

	it("an earlier question saved late, after a later one revealed its answer, stays his own (round 4's o37)", async () => {
		const check = asked("Compute the eigenvalues of $A$.");
		const prediction = asked("Predict the eigenvectors of $A$.", { text: "(1,1) and (1,0)", confidence: "guessing" });
		const { saves, tools } = savingCourse([...check.messages, ...prediction.messages]);
		await courseSave(tools, [attempt(["eigen"], "correct", "none", { question: check.id }), attempt(["eigen"], "partial", "none", { question: prediction.id, predicted: true })]);
		assert.equal(saves[0]!.observations![0]!.help, "none");
		assert.equal(saves[0]!.observations![1]!.help, "none");
	});

	it("the question field is the app's: checked, and taken off before the engine reads the patch", async () => {
		const check = asked("Compute the eigenvalues of $A$.");
		const { saves, tools } = savingCourse(check.messages);
		await courseSave(tools, [attempt(["eigen", "kernel"], "correct", "none", { question: check.id })]);
		assert.equal("question" in saves[0]!.observations![0]!, false);
		assert.equal(saves[0]!.observations!.length, 1);
	});

	it("a question that is no answer of this session is refused, naming the fix, and nothing is saved", async () => {
		const hinted = asked("What is the rank of $A$?", { hintRequested: true });
		const { saves, tools } = savingCourse(hinted.messages);
		const refused = await courseSave(tools, [attempt(["rank"], "correct", "none", { question: hinted.id })]);
		assert.equal(refused.isError, true);
		assert.match(refused.text, /observations\[0\]\.question: .* is not an answer of this session/);
		assert.equal(saves.length, 0);
	});

	it("help the tutor named stays", async () => {
		const first = asked("What is the rank of $A$?");
		const again = asked("What is the rank of $A$?");
		const { saves, tools } = savingCourse([...first.messages, ...again.messages]);
		await courseSave(tools, [attempt(["rank"], "correct", "Hint R1: re-described the pattern class", { question: again.id })]);
		assert.equal(saves[0]!.observations![0]!.help, "Hint R1: re-described the pattern class");
	});

	it("a practice problem posed again after Explain instead on it is saved helped; a different problem is not", async () => {
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

		const same = [...explained, ...conclude({ outcome: "movedOn", result: null }), ...pose(["rank"])];
		same.push(newThinkingMessage(lastId(same), "Row 3 = row 1 + row 2, so rank 2", "neutral"));
		await concludeOn(same, { outcome: "solved", result: "correct" });
		assert.equal(saves[0]!.observations![0]!.help, SHOWN_HELP);

		const other = [...explained, ...conclude({ outcome: "movedOn", result: null }), ...pose(["rank"], "Find the rank of $B$.")];
		other.push(newThinkingMessage(lastId(other), "Two pivots, so rank 2", "neutral"));
		await concludeOn(other, { outcome: "solved", result: "correct" });
		assert.equal(saves[1]!.observations![0]!.help, "none");
	});
});
