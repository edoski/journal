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
import { courseTools } from "../src/agent/tools/course.ts";

describe("a start a save moved past the exam is said in the close (round 16, M1)", () => {
	it("the save's contract asks the close to say it now comes after the exam", () => {
		const records = { run: async () => ({ ok: true, json: {} }), map: async () => ({ ok: false }), forgotten: () => false } as never;
		const tools = courseTools({ course: { workspace: "/s/pr", title: "Probability" }, records, arcs: false });
		assert.match(tools.course_save!.description, /with `past_exam`, that it now comes after the exam/);
	});
});
