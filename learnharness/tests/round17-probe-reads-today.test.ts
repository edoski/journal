/**
 * Round 17, m17 (4 minor 3): after the Eigen lesson, the Diagonalization
 * probe asked five questions, all right on his own, with no teaching. Its
 * third, "Why is a number λ an eigenvalue of a square matrix A exactly
 * when det(A − λI) = 0?", was what his Eigen answer that hour (o128) and
 * its gap already showed. The prober now reads what today measured on the
 * topics the lesson stands on, never asks it again, and stops once his
 * answers place him.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { promptVoiceBreaks } from "../src/core/voice-check.ts";

describe("the probe reads today's answers and stops once he is placed (round 17, m17)", () => {
	const prober = composeInstructions("prober");

	it("an answer today on a topic the lesson stands on brackets its strand: never asked again", () => {
		assert.match(prober, /\*\*What today already measured is measured\.\*\* Read each topic the lesson stands on with `course_show` before its first question\. One whose `standing\.last` is dated today was answered today/);
		assert.match(prober, /Never ask what those answers show again, in any words\./);
	});

	it("a right answer on his own at the lesson's starting height ends the probe, with no count of questions", () => {
		assert.match(prober, /\*\*Stop once he is placed\.\*\* A right answer on his own, with its reasoning sound, at the height the lesson starts from places every strand under it: conclude then/);
		assert.doesNotMatch(prober, /\b(?:three|3) right answers\b/, "no magic number of answers");
	});

	it("the new lines keep the voice", () => {
		assert.deepEqual(promptVoiceBreaks(prober), []);
	});
});
