/**
 * Show me on a lesson's or a review's check (round 6 N12, round 7): he can
 * give up on a check as he can on a practice problem. It reveals the
 * committed answer, takes no confidence, and tells the tutor to save an
 * attempt he gave up and show the worked answer.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAnswer, compactAnswerForModel, type QuestionData } from "../src/core/question-core.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { turnInputOf } from "../src/agent/voice-guard.ts";
import { proseShowMeRequest, proseQuestionSpec } from "../components/lesson/prose/prose-question-data.ts";
import { KEYBOARD_ACTIONS } from "../src/core/keyboard.ts";

const PROOF = "Suppose $e$ and $e'$ are both identities. Then $e = ee' = e'$.";
const check: QuestionData = { id: "q1", kind: "explain", question: "Prove the identity is unique.", mode: "text", options: [], committedAnswer: PROOF, createdAt: "2026-11-15T10:00:00Z" };

describe("Show me on a check", () => {
	it("is his giving up: the committed answer shows, his work goes with it, no confidence is read", () => {
		const answer = buildAnswer(check, { text: "take two identities", showMe: true, confidence: "confident" }, "explain");
		assert.equal(answer.showMe, true);
		assert.equal(answer.committed, PROOF);
		assert.equal(answer.confidence, undefined);
		assert.equal(answer.text, "take two identities");
	});

	it("tells the tutor to save an attempt he gave up and show the worked answer", () => {
		const model = compactAnswerForModel(buildAnswer(check, { showMe: true }, "explain"));
		assert.match(String(model.showMe), /gives up.*gave_up true.*worked answer/s);
	});

	it("every teaching agent reads the rule", () => {
		for (const agent of ["prober", "teacher"] as const) assert.match(composeInstructions(agent), /Show me gives up the question/);
	});

	it("its reply sets its own length, as a shown solution does", () => {
		const answer = buildAnswer(check, { showMe: true }, "explain");
		const input = turnInputOf([{ id: "r", role: "toolResult", toolCallId: "q1", toolName: "explain", content: [{ type: "text", text: "{}" }], details: answer, isError: false, timestamp: 1 } as never]);
		assert.deepEqual(input, { kind: undefined, answers: false, words: null });
	});

	it("the composer's request carries his words as his work, and its key is named for a check too", () => {
		const spec = proseQuestionSpec("explain", "q1", { question: check.question, type: "check", correctAnswer: PROOF });
		assert.ok(spec);
		assert.equal(proseShowMeRequest(spec!, "  stuck at e'  ").text, "stuck at e'");
		assert.equal(spec!.showsAnswer, true);
		assert.equal(proseQuestionSpec("explain", "q2", { question: "What do you expect?", type: "predict", correctAnswer: "x" })!.showsAnswer, false, "a prediction asks before anything is taught, so it has no answer to show");
		assert.match(KEYBOARD_ACTIONS.find((s) => s.id === "practice-show")!.label, /check/);
	});
});
