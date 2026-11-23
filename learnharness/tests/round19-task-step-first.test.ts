/**
 * Round 19 carry-in 1 (round 18 P5's runs): on Continue Problem sheet 4,
 * 5 of 8 turns read the task's record, which names his two misses at part
 * (c), then worked part (c) on his own matrix A in a message and asked a
 * check on a new matrix B: his hand-in part was done for him. The words
 * Continue and an open task's wake give the tutor now ask the step first,
 * as his own work, and teach a gap only after his try, on an example of
 * the tutor's own.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TASK_HANDOFF_TEXT, TASK_STEP_FIRST, taskContinueText } from "../src/core/contracts.ts";

describe("Continue on his task asks his step before teaching (round 19, carry-in 1)", () => {
	const continued = taskContinueText(["sheet-4"], "A further problem, for hand-in. Let $A$ be the $3 \\times 5$ matrix…");

	it("Continue and the task's wake both ask the step first and never work it", () => {
		assert.ok(TASK_HANDOFF_TEXT.includes(TASK_STEP_FIRST));
		assert.match(TASK_HANDOFF_TEXT, /Pose the step to me first, as my own work, and let me try it before you teach anything: never work it, or any part of it, yourself\./);
		// Continue shows the step itself, so his next message is his try at it (round 21, m7).
		assert.match(continued, /What I send next is my own try at that step/);
		assert.match(continued, /Never work the step, or any part of it, yourself\./);
		for (const text of [continued, TASK_HANDOFF_TEXT]) assert.match(text, /If my try shows a gap, teach it then, on an example of your own, never on my task's own matrix or numbers\./);
	});

	it("no longer invites a taught step before his part", () => {
		for (const text of [continued, TASK_HANDOFF_TEXT]) assert.doesNotMatch(text, /a (?:step|node) before it only for a gap/);
	});
});
