/** Only a confidence he chose reaches the tutor and the record (round 5:
 *  "Neutral" showed as his confidence when he had chosen none). The meter
 *  left alone reads Neutral; that is no choice, so nothing is sent. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAnswer, compactAnswerForModel, newThinkingMessage } from "../src/core/index.ts";
import { engineConfidence } from "../src/core/engine-confidence.ts";
import { practiceObservations } from "../src/core/practice-attempts.ts";
import { proseQuestionSpec } from "../components/lesson/prose/prose-question-data.ts";

const check = { question: "Why is det zero?", correctAnswer: "The kernel is nontrivial.", type: "check" };
const spec = proseQuestionSpec("explain", "c1", check)!;

describe("a confidence he never chose", () => {
	it("rides no answer and reaches no tutor", () => {
		const left = buildAnswer(spec.data, { text: "kernel", confidence: "neutral" }, "explain");
		assert.equal(left.confidence, undefined);
		assert.equal(compactAnswerForModel({ ...left, confidence: "neutral" }).confidence, undefined, "an old record's neutral is not read as a choice either");
		const sure = buildAnswer(spec.data, { text: "kernel", confidence: "confident" }, "explain");
		assert.equal(compactAnswerForModel(sure).confidence, "confident");
	});

	it("rides no practice submission and no saved attempt", () => {
		const thinking = newThinkingMessage("p1", "rank 2", "neutral");
		assert.doesNotMatch(String(thinking.content), /Confidence/);
		assert.deepEqual(thinking.details, { problemCallId: "p1", text: "rank 2" });
		assert.deepEqual(engineConfidence("neutral"), {});
		assert.deepEqual(engineConfidence("guessing"), { sure: "guess" });
		const [saved] = practiceObservations({ statement: "Rank?", topics: ["rank"] }, { outcome: "solved", result: "correct", rung: null, response: "2" }, "neutral");
		assert.equal(saved!.sure, undefined);
	});
});
