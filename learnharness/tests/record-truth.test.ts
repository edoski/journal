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
import { PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, answeredQuestionsOf, newDisputeMessage, type LhMessage } from "../src/core/native-messages.ts";
import { remarkableOf } from "../src/core/answer-marks.ts";
import { courseTools, SHOW_ME_HELP, type CourseToolContext } from "../src/agent/tools/course.ts";

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
		remarkable: remarkableOf(messages),
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

	it("an answer to a prediction is always saved as one, as his box said, even when the save counts it (round 8, 4 #12); a probe's recall is never a prediction", async () => {
		const guess = asked("predict");
		const reasoned = asked("predict");
		const recall = call("recall", { question: "Recall", correctAnswer: "2" }, { details: { kind: "explain", tool: "recall", questionText: "Recall", answers: [], answeredAt: "", text: "2" } });
		const { saves, tools } = savingCourse([...guess.messages, ...reasoned.messages, ...recall.messages]);
		await courseSave(tools, [attempt({ question: guess.id, predicted: true }), attempt({ question: reasoned.id }), attempt({ question: recall.id, predicted: true })]);
		assert.equal(saves[0]!.observations![0]!.predicted, true);
		assert.equal(saves[0]!.observations![1]!.predicted, true);
		assert.equal("predicted" in saves[0]!.observations![2]!, false);
	});
});

describe("a Show me is saved as practice saves it (round 8, 2 M3)", () => {
	it("a lesson's Show me saved as no help is saved given up, with the answer shown as its help", async () => {
		const shown = asked("check", { text: "S - I = 0 1 0 0, so", showMe: true });
		const { saves, tools } = savingCourse(shown.messages);
		const ok = await courseSave(tools, [attempt({ question: shown.id, result: "incorrect", gave_up: true })]);
		assert.equal(ok.isError, false, ok.text);
		const o = saves[0]!.observations![0]!;
		assert.deepEqual({ result: o.result, gave_up: o.gave_up, help: o.help, shown: o.shown }, { result: "incorrect", gave_up: true, help: SHOW_ME_HELP, shown: true });
	});

	it("keeps a hint the save names, and an answer he gave without Show me is untouched", async () => {
		const shown = asked("check", { text: "", showMe: true });
		const own = asked("check");
		const { saves, tools } = savingCourse([...shown.messages, ...own.messages]);
		await courseSave(tools, [attempt({ question: shown.id, help: "Pointed at the kernel", result: "partial" }), attempt({ question: own.id })]);
		const [first, second] = saves[0]!.observations!;
		assert.deepEqual({ result: first!.result, help: first!.help, shown: first!.shown, gave_up: first!.gave_up }, { result: "incorrect", help: "Pointed at the kernel", shown: true, gave_up: true });
		assert.deepEqual({ help: second!.help, shown: second!.shown, gave_up: second!.gave_up }, { help: "none", shown: undefined, gave_up: undefined });
	});
});

describe("a re-mark corrects only what this session saved or he disputed (round 8, 2 m1)", () => {
	it("an older answer he did not dispute is refused, naming the fix, and nothing is saved", async () => {
		const check = asked("check");
		const { saves, tools } = savingCourse(check.messages);
		const refused = await courseSave(tools, [attempt({ question: check.id }), attempt({ corrects: ["o31"], result: "correct" })]);
		assert.equal(refused.isError, true);
		assert.match(refused.text, /o31 was not saved in this session, and he did not dispute it/);
		assert.equal(saves.length, 0);
	});

	it("an answer this session saved may be set right; a ruling re-marks only what his dispute named; his own report may correct any", async () => {
		const check = asked("check");
		const first = saved({ changes: { observations: [attempt({ question: check.id })] } });
		const messages = [...check.messages, ...first.messages];
		const { saves, tools } = savingCourse(messages);
		assert.equal((await courseSave(tools, [attempt({ corrects: ["o6"], result: "partial" })])).isError, false);
		assert.match((await courseSave(tools, [attempt({ corrects: ["o6"], disputed: "It was right", ruling: "It was" })])).text, /he disputed no mark of o6/);
		assert.equal((await courseSave(tools, [{ kind: "self_report", topics: ["eigen"], text: "Says the old answer was a typo", corrects: ["o2"] }])).isError, false);
		const disputing = savingCourse([...messages, newDisputeMessage({ answerId: check.id, observations: ["o6"], said: "It was right" }, "Question")]);
		assert.equal((await courseSave(disputing.tools, [attempt({ corrects: ["o6"], disputed: "It was right", ruling: "It was" })])).isError, false);
		assert.equal(saves.length, 2);
	});

	it("an answer saved earlier in the same turn may be set right in that turn, though the turn began before it was saved", async () => {
		const check = asked("check");
		const { saves, tools } = savingCourse(check.messages);
		assert.equal((await courseSave(tools, [attempt({ question: check.id })])).isError, false);
		const remark = await courseSave(tools, [attempt({ corrects: ["o41"], result: "partial" })]);
		assert.equal(remark.isError, false, remark.text);
		assert.equal(saves.length, 2);
	});

	it("an answer saved just before a restart is this session's own, from the save kept with the lesson, though the transcript lost its receipt (round 8: J2's re-mark rule meeting J5's kept saves)", () => {
		const check = asked("check");
		assert.equal(remarkableOf(check.messages).saved.has("o6"), false);
		assert.equal(remarkableOf(check.messages, { [check.id]: ["o6"] }).saved.has("o6"), true);
	});
});

describe("a not-right answer's text says what went wrong, never the question (round 9, 2 m1)", () => {
	it("refuses a partly right or wrong answer saved with its question as its text, naming the fix, and saves nothing", async () => {
		const check = asked("check", { text: "(1, 2)" });
		const question = `Question ${n}`;
		const { saves, tools } = savingCourse(check.messages);
		const refused = await courseSave(tools, [attempt({ question: check.id, text: question, response: "(1, 2)", result: "partial" })]);
		assert.equal(refused.isError, true);
		assert.match(refused.text, /observations\[0\]\.text: a not-right answer's text says what went wrong/);
		assert.equal(saves.length, 0);
		const asking = await courseSave(tools, [attempt({ question: check.id, text: "Which vectors v satisfy Bv = 5v?", result: "incorrect" })]);
		assert.equal(asking.isError, true, "a question as text, though not the one asked word for word");
	});

	it("saves a miss whose text says what went wrong, a right answer with its question, a prediction and a Show me as they come", async () => {
		const miss = asked("check", { text: "(1, 2)" });
		const right = asked("check");
		const guess = asked("predict");
		const shown = asked("check", { text: "", showMe: true });
		const { saves, tools } = savingCourse([...miss.messages, ...right.messages, ...guess.messages, ...shown.messages]);
		const ok = await courseSave(tools, [
			attempt({ question: miss.id, text: "Took $(1,2)$ as a vector of $E_2$; it gives $2x+y=4$, not $0$", result: "partial" }),
			attempt({ question: right.id, text: `Question ${n - 2}`, result: "correct" }),
			attempt({ question: guess.id, text: `Question ${n - 1}`, result: "incorrect" }),
			attempt({ question: shown.id, text: `Question ${n}`, result: "incorrect" }),
		]);
		assert.equal(ok.isError, false, ok.text);
		assert.equal(saves[0]!.observations!.length, 4);
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
		const recorded = call("course_save", { changes: { observations: [attempt()] } }, { text: JSON.stringify({ saved: ["o5"] }) });
		const first = said("I'm sure it's 2");
		const { saves, tools } = savingCourse([...recorded.messages, ...check.messages, first]);
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
		const dispute = newDisputeMessage({ answerId: check.id, observations: ["o6"], said: "It was right" }, "Question");
		const { saves, tools } = savingCourse([...check.messages, ...first.messages, dispute]);
		const ok = await courseSave(tools, [
			attempt({ corrects: ["o6"], disputed: "It was right", ruling: "It was" }),
			{ kind: "exam", topics: ["eigen"], text: "Midterm question 2", result: "correct" },
			{ kind: "self_report", topics: ["eigen"], text: "Says he practised eigenvectors" },
		]);
		assert.equal(ok.isError, false, ok.text);
		assert.equal(saves[0]!.observations!.length, 3);
	});
});
