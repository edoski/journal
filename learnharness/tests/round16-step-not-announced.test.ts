/**
 * Round 16, m10 (3 m2, 37): the Binomial review's first teaching step
 * opened "Let's re-teach the counting step.", a line the review's wake,
 * the teacher's doctrine and the course record all asked for ("say so in
 * one plain line before you re-teach"). His step strip already names the
 * step, so the line taught nothing.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { REVIEW_HANDOFF_TEXT } from "../src/core/contracts/chat.ts";

const rules = (text: string) => voiceBreaks(text, "teach").map((b) => b.rule);

describe("a re-taught step opens on its content (round 16, m10)", () => {
	it("refuses the recorded opener and its kin", () => {
		for (const text of [
			"Let's re-teach the counting step. A run of six flips with exactly one head can put that head in any of six places.",
			"We'll go over the counting step first. Six flips give six places for one head.",
			"Let us revisit why the binomial PMF carries $\\binom{n}{k}$.",
		]) assert.ok(rules(text).includes("narration"), text);
	});

	it("leaves a step that opens on its content", () => {
		assert.ok(!rules("A run of six flips with exactly one head can put that head in any of six places, so the count is $\\binom{6}{1} = 6$.").includes("narration"));
	});

	it("nothing the teacher reads asks for the line", () => {
		for (const text of [REVIEW_HANDOFF_TEXT, composeInstructions("teacher"), courseRecordPrompt("teacher", { arcs: true })]) {
			assert.doesNotMatch(text, /re-teach the counting step|one plain line (?:saying you re-teach|before you re-teach)/);
		}
		assert.match(REVIEW_HANDOFF_TEXT, /opening on its content with no line announcing it/);
	});
});
