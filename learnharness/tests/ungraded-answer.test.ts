/**
 * An answer a stop cut off before its grade is still recorded (round 3:
 * a confident wrong answer, its answer already shown, was saved only if he
 * pressed Try again). He answered and saw the answer, so by the engine's
 * rules it is an attempt: his next input carries a note that has the tutor
 * grade and save it first, whatever he does next.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";

import { inputAppends } from "../src/core/input-events.ts";
import { newAnswerResult, ungradedAnswerOf, UNGRADED_ANSWER, type LhMarkerMessage, type LhMessage } from "../src/core/native-messages.ts";
import { buildAnswer } from "../src/core/question-core.ts";

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
} as const;

const QUESTION = "Find the eigenvalues of $A$.";
const assistant = (content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"], id: string): LhMessage => ({ id, role: "assistant", content, timestamp: 1, stopReason, ...STAMPS }) as LhMessage;

function answered(type: "check" | "predict" = "check"): LhMessage[] {
	const ask = assistant([{ type: "toolCall", id: "q1", name: "explain", arguments: { question: QUESTION, type, correctAnswer: "1 and 3" } }], "toolUse", "a1");
	const answer = buildAnswer({ id: "q1", kind: "explain", question: QUESTION, mode: "text", options: [], createdAt: "fixture" }, { text: "2 and 3" });
	return [ask, newAnswerResult("q1", "explain", answer)];
}

const stopped = assistant([], "aborted", "a2");
const saved = (): LhMessage[] => [
	assistant([{ type: "toolCall", id: "s1", name: "course_save", arguments: { changes: { observations: [] } } }], "aborted", "a3"),
	{ id: "r3", role: "toolResult", toolCallId: "s1", toolName: "course_save", content: [{ type: "text", text: "{}" }], details: null, isError: false, timestamp: 2 } as LhMessage,
];

describe("an answer a stop cut off before its grade", () => {
	it("is found when every reply since it was cut and nothing saved it", () => {
		assert.equal(ungradedAnswerOf([...answered(), stopped]), QUESTION);
	});

	it("is not when a save went through, a reply finished, or it was a prediction", () => {
		assert.equal(ungradedAnswerOf([...answered(), ...saved()]), null);
		assert.equal(ungradedAnswerOf([...answered(), assistant([{ type: "text", text: "Right." }], "stop", "a4")]), null);
		assert.equal(ungradedAnswerOf([...answered("predict"), stopped]), null);
	});

	it("rides his next message and Done for today as a note to grade and save it first", () => {
		const record = { messages: [...answered(), stopped], kind: "teach" as const };
		const [note, message] = inputAppends(record, { type: "text", text: "Why 1?" }) as LhMarkerMessage[];
		assert.equal(note!.customType, UNGRADED_ANSWER);
		assert.match(note!.content, /grade it and save it with course_save in this turn, before anything else/);
		assert.equal(message!.role, "user");
		const tonight = inputAppends(record, { type: "tonight" }) as LhMarkerMessage[];
		assert.deepEqual(tonight.slice(-2).map((m) => m.customType), [UNGRADED_ANSWER, "done-tonight"]);
	});

	it("adds nothing once the answer is saved", () => {
		const appends = inputAppends({ messages: [...answered(), ...saved()], kind: "teach" }, { type: "text", text: "Next?" });
		assert.equal(appends.length, 1);
	});
});
