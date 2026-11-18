/**
 * A wrong answer's record leads with what went wrong (round 10, 2 m8): the
 * doctrine every agent reads said `text` "says what he was asked and …
 * what went wrong", so the Eigen row in his Mistakes list read "Found all
 * the directions F = (…) keeps: you got λ = 6 and λ = 1, then stopped…"
 * and the slip fell past the row's two-line cut. Every agent's course
 * doctrine, the engine's included, now puts the slip first.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

describe("a wrong answer's record", () => {
	it("leads with what went wrong, in every agent's course doctrine", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) {
			const prompt = courseRecordPrompt(agent, { arcs: false });
			assert.match(prompt, /`text` (?:that )?leads with what went wrong/, agent);
			assert.doesNotMatch(prompt, /`text` says what (?:he|the learner) was asked and/, agent);
			assert.doesNotMatch(prompt, /`text` saying what was asked and/, agent);
		}
	});
});
