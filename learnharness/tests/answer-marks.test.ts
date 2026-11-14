import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answerMarksOf, correctorsToRead, latestMarkedAnswer, markLinks } from "../src/core/answer-marks.ts";
import { ChatInputError, inputAppends, parseChatInput } from "../src/core/input-events.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { owedMessages, sdkInputBlocks } from "../src/core/sdk-session.ts";
import { countedWords } from "../components/study-words.ts";

let n = 0;
const id = () => `m${++n}`;

function call(callId: string, name: string, args: unknown = {}): LhMessage {
	return {
		id: id(),
		role: "assistant",
		content: [{ type: "toolCall", id: callId, name, arguments: args }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "toolUse",
		timestamp: 0,
	} as LhMessage;
}

function result(callId: string, toolName: string, text: string, details: unknown = null, isError = false): LhMessage {
	return { id: id(), role: "toolResult", toolCallId: callId, toolName, content: [{ type: "text", text }], details, isError, timestamp: 0 } as LhMessage;
}

const answer = (question: string, extra: object = {}) => ({ kind: "explain", tool: "explain", questionText: question, answers: [], text: "rank 2", confidence: "confident", answeredAt: "", ...extra });
const receipt = (...ids: string[]) => JSON.stringify({ revision: 3, changed: true, observations: ids, duplicates: [], saved: ids });
const named = (question: string | null, text = "q") => ({ topics: ["rank"], text, help: "none", result: "correct", ...(question ? { question } : {}) });

/** A check answered and marked by a save naming it, then a hint request
 *  whose save names it too (and is no answer). */
function lesson(): LhMessage[] {
	return [
		call("q1", "explain", { question: "Rank of A?", correctAnswer: "2" }),
		result("q1", "explain", "{}", answer("Rank of A?")),
		call("s1", "course_save", { changes: { observations: [named("q1")] } }),
		result("s1", "course_save", receipt("o4")),
		call("q2", "explain", { question: "Kernel of A?", correctAnswer: "span" }),
		result("q2", "explain", "{}", answer("Kernel of A?", { hintRequested: true })),
		call("s2", "course_save", { changes: { observations: [named("q2")] } }),
		result("s2", "course_save", receipt("o5")),
	];
}

describe("which attempts mark which answer", () => {
	it("an attempt marks the answer it names; a hint request is no answer", () => {
		assert.deepEqual(markLinks(lesson()), { q1: ["o4"] });
	});

	it("a late save of an earlier check marks that check, not the prediction answered since (round 4)", () => {
		const messages = [
			call("q1", "explain", { question: "Eigenvalues of A?", correctAnswer: "5, 2" }),
			result("q1", "explain", "{}", answer("Eigenvalues of A?")),
			call("q2", "explain", { type: "predict", question: "Guess the eigenvectors", correctAnswer: "(1,1), (1,-2)" }),
			result("q2", "explain", "{}", answer("Guess the eigenvectors", { confidence: "guessing" })),
			call("s1", "course_save", { changes: JSON.stringify({ observations: [named("q1", "the check")] }) }),
			result("s1", "course_save", receipt("o37")),
		];
		assert.deepEqual(markLinks(messages), { q1: ["o37"] });
	});

	it("pairs by each observation's place in the save, a repeated one by the stored id", () => {
		const messages = [
			call("q1", "explain", { question: "A?", correctAnswer: "a" }),
			result("q1", "explain", "{}", answer("A?")),
			call("q2", "explain", { question: "B?", correctAnswer: "b" }),
			result("q2", "explain", "{}", answer("B?")),
			call("s1", "course_save", { changes: { observations: [named(null, "said in words"), named("q2"), named("q1")] } }),
			result("s1", "course_save", JSON.stringify({ observations: ["o8", "o9"], duplicates: ["o3"], saved: ["o8", "o3", "o9"] })),
		];
		assert.deepEqual(markLinks(messages), { q2: ["o3"], q1: ["o9"] });
	});

	it("a practice problem's marks are its conclude receipt and any save that names the conclude", () => {
		const messages = [
			call("p1", "problem", { statement: "Find the rank.", topics: ["rank"] }),
			result("p1", "problem", "posed"),
			call("c1", "conclude", { outcome: "solved" }),
			result("c1", "conclude", `Problem concluded.\n\nCourse record: ${receipt("o7", "o8")}`),
			call("s3", "course_save", { changes: { observations: [named("c1")] } }),
			result("s3", "course_save", receipt("o9")),
		];
		assert.deepEqual(markLinks(messages), { c1: ["o7", "o8", "o9"] });
	});

	it("an attempt that names no answer, or a refused save, marks nothing", () => {
		const messages = [
			...lesson().slice(0, 2),
			{ id: id(), role: "user", content: [{ type: "text", text: "wait" }], timestamp: 0 } as LhMessage,
			call("s9", "course_save", { changes: { observations: [named(null)] } }),
			result("s9", "course_save", receipt("o6")),
			call("s10", "course_save", { changes: { observations: [named("q1")] } }),
			result("s10", "course_save", "refused", null, true),
		];
		assert.deepEqual(markLinks(messages), {});
	});
});

const shown = {
	o4: { kind: "attempt", topics: ["rank"], result: "incorrect", help: "none", sure: "confident", grade: "missed", corrected_by: ["o6"] },
	o6: { kind: "attempt", topics: ["rank"], result: "correct", help: "none", sure: "confident", grade: "solid", disputed: "It is 2", ruling: "You are right: the pivots give rank 2." },
};

describe("the mark that stands", () => {
	it("follows a re-mark to the attempt that corrects it and keeps the ruling", () => {
		assert.deepEqual(correctorsToRead({ o4: shown.o4 }, ["o4"]), ["o6"]);
		assert.deepEqual(answerMarksOf({ q1: ["o4"] }, shown), {
			q1: {
				rows: [{ id: "o6", topics: ["rank"], label: null, result: "correct", grade: "solid", helped: false, sure: "confident" }],
				disputed: true,
				ruling: "You are right: the pivots give rank 2.",
			},
		});
	});

	it("a rejected dispute keeps the mark and says it was disputed", () => {
		const held = { ...shown, o6: { ...shown.o6, result: "incorrect", grade: "missed", ruling: "The sign is wrong." } };
		const mark = answerMarksOf({ q1: ["o4"] }, held).q1!;
		assert.equal(mark.rows[0]!.result, "incorrect");
		assert.equal(mark.disputed, true);
		assert.equal(mark.ruling, "The sign is wrong.");
	});

	it("a first try and a final attempt read as two rows", () => {
		const practice = {
			o7: { kind: "attempt", topics: ["rank"], result: "incorrect", help: "none", grade: "missed" },
			o8: { kind: "attempt", topics: ["rank"], result: "correct", help: "Hint R3: named the idea to use", grade: "helped" },
		};
		const mark = answerMarksOf({ c1: ["o7", "o8"] }, practice).c1!;
		assert.deepEqual(mark.rows.map((r) => [r.label, r.result, countedWords(r)]), [
			["First try", "incorrect", "On your own"],
			["Then", "correct", "With help"],
		]);
	});

	it("a self-report that supersedes an attempt leaves no mark", () => {
		const reported = { o4: { ...shown.o4, corrected_by: ["o5"] }, o5: { kind: "self_report", topics: ["rank"] } };
		assert.deepEqual(answerMarksOf({ q1: ["o4"] }, reported), {});
	});

	it("a right guess counted as helped says so", () => {
		assert.equal(countedWords({ grade: "helped", helped: false }), "Counted as helped");
		assert.equal(countedWords({ grade: "solid", helped: false }), "On your own");
	});

	it("⌘⇧M picks the newest marked answer", () => {
		const marks = answerMarksOf({ q1: ["o4"] }, shown);
		assert.equal(latestMarkedAnswer(lesson(), marks), "q1");
		assert.equal(latestMarkedAnswer(lesson(), {}), null);
	});
});

describe("the dispute input", () => {
	it("parses his words or his pick, and refuses neither", () => {
		assert.deepEqual(parseChatInput({ type: "dispute", answerId: "q1", observations: ["o4"], said: " It is 2 " }), {
			type: "dispute",
			answerId: "q1",
			observations: ["o4"],
			said: "It is 2",
		});
		assert.throws(() => parseChatInput({ type: "dispute", answerId: "q1", observations: ["o4"] }), ChatInputError);
		assert.throws(() => parseChatInput({ type: "dispute", answerId: "q1", observations: ["x"], proposed: "correct" }), ChatInputError);
		assert.throws(() => parseChatInput({ type: "dispute", answerId: "q1", observations: ["o4"], proposed: "maybe" }), ChatInputError);
	});

	it("goes to the tutor as its own message naming the answer and its attempts", () => {
		const appends = inputAppends({ messages: lesson() }, { type: "dispute", answerId: "q1", observations: ["o4"], said: "It is 2", proposed: "correct" });
		assert.equal(appends.length, 1);
		const marker = appends[0]!;
		assert.equal(marker.role, "custom");
		const content = (marker as { content: string }).content;
		assert.match(content, /^\[MARK DISPUTED\]/);
		assert.match(content, /"Rank of A\?"/);
		assert.match(content, /o4/);
		assert.match(content, /"It is 2"/);
		assert.match(content, /right \(correct\)/);
		assert.deepEqual((marker as { details: unknown }).details, { answerId: "q1", observations: ["o4"], said: "It is 2", proposed: "correct" });
	});

	it("is refused for an answer with no mark", () => {
		assert.throws(() => inputAppends({ messages: lesson() }, { type: "dispute", answerId: "q2", observations: ["o5"], said: "x" }), /no marked answer/);
	});

	it("leaves an open question set aside: the next message carries no answer for it", () => {
		const open = [...lesson().slice(0, 4), call("q3", "explain", { question: "Nullity?", correctAnswer: "1" })];
		const appends = inputAppends({ messages: open }, { type: "dispute", answerId: "q1", observations: ["o4"], said: "It is 2" });
		assert.ok(!appends.some((m) => m.role === "toolResult"), "no result is made up for the open question");
		const owed = owedMessages([...open, ...appends], { id: "s", synced: open.at(-1)!.id })!;
		const blocks = sdkInputBlocks(owed);
		assert.equal(blocks.length, 1);
		assert.match((blocks[0] as { text: string }).text, /^\[MARK DISPUTED\]/);
		assert.ok(!blocks.some((b) => b.type === "text" && b.text.includes('call="q3"')), "the model reads the question as set aside");
	});
});
