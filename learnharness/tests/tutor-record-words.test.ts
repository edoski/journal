/**
 * What the tutor asks and says about the record: a computation asked as a
 * prediction never counted (round 9, 2 m3), and a review that turned into
 * teaching was never said to and was called a lesson (round 9, 2 m4).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeInstructions } from "../src/agent/teacher-agent.ts";

describe("a prediction asks for a guess, a computation is a check (round 9, 2 m3)", () => {
	const teacher = composeInstructions("teacher");

	it("tells the teacher that a question he can compute from what was taught is a check, even when it opens a step", () => {
		assert.match(teacher, /a question he can compute or derive from what was already taught is a check, even when it opens a step/);
	});

	it("names the round's own case as a check, never a prediction", () => {
		assert.match(teacher, /"Which vectors satisfy \$Bv = 5v\$\?" is a check, never a prediction/);
	});
});

describe("a review that turns into teaching says so and stays a review (round 9, 2 m4)", () => {
	const teacher = composeInstructions("teacher");

	it("says the switch in one line, keeps calling it his review at the close, and saves no task for it", () => {
		assert.match(teacher, /When a review's answers show he must be taught part of the topic again, say so in one plain line before you re-teach/);
		assert.match(teacher, /keep calling the session his review, its close included, never "the lesson"/);
		assert.match(teacher, /save no task for it/);
	});
});
