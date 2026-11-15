/**
 * What the tutor asks as a prediction (round 9, 2 m3): "Which vectors v
 * satisfy Bv = 5v?" was asked as a prediction after the eigen-equation was
 * taught, so his full, right computation never counted. The teacher reads
 * that a question he can work out from what was taught is a check.
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
