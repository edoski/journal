/**
 * Round 16, M1 (1 M1): on the Probability exam's eve a save moved
 * Expectation's start, told "today" that morning, past the exam, and the
 * close named only tomorrow's reviews. The engine now gives the move from
 * this morning's plan and `past_exam` on the save's `starts_moved`
 * (tests/learning/test_one_plan.py); the save's contract asks the close to
 * say both.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { receiptOfSaves } from "../src/core/close-receipt.ts";

describe("a start a save moved past the exam is said in the close (round 16, M1)", () => {
	it("the close receipt's sentence says it now comes after the exam (round 20, M3)", () => {
		const moved = { expectation: { title: "Expectation and linearity", starts: "2026-11-20", moved: { from: "2026-11-18", by: "study", waits_on: ["Random variables and distributions"] }, past_exam: true } };
		const receipt = receiptOfSaves([{ topics: [], receipt: { reviews: {}, starts_moved: moved } }], "2026-11-18");
		assert.equal(receipt.says, "“Expectation and linearity” now starts on Friday 20 November, after the exam, since it waits on Random variables and distributions.");
	});
});
