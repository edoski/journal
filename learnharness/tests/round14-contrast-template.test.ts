/**
 * Round 14, m15 (3 n4): "You held that X, whereas Y" closed every
 * confident-wrong answer (05, 16, 38, 47), stilted and formulaic after the
 * exact break was already said. The voice asked for it ("A confident one
 * also gets its contrast: what he held against what is true"). Now one
 * plain contrast sentence comes only when it adds something, and the
 * template is refused.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";

const rules = (text: string) => voiceBreaks(text, "wrong").map((b) => b.rule);

describe("no \"You held that…, whereas…\" (round 14, m15)", () => {
	it("refuses the recorded closings", () => {
		for (const text of [
			"The kernel part holds, but the free variable only gives many solutions for a reachable b. You held that extra freedom in x widens what Ax reaches, whereas it sends more inputs onto the same outputs.",
			"The 3 you subtracted the rank from is the wrong count. You held that the nullity is rows minus rank, but it is columns minus rank.",
		]) assert.ok(rules(text).includes("contrast"), text);
	});

	it("leaves a plain contrast and an ordinary \"whereas\" alone", () => {
		assert.ok(!rules("Distinct columns do not rule out collisions, because the third column is the sum of the other two.").includes("contrast"));
		assert.ok(!rules("A square matrix with no collisions reaches every output, whereas a wide one never can.").includes("contrast"));
	});

	it("the voice asks for one plain sentence only when it adds something", () => {
		const teacher = composeInstructions("teacher");
		assert.doesNotMatch(teacher, /what he held against what is true/);
		assert.match(teacher, /one plain sentence of contrast only when it adds something/);
	});
});
