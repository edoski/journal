/**
 * Round 19, m1 (2 N1): in the Binomial review he answered, at Confident,
 * "C(10,3)(1/4)³(3/4)⁷ = 120 × 0.015625 × 0.1335 ≈ 0.31" (the true value is
 * 0.25). The feedback said "…comes to about 0.25, not 0.31", yet o95 was
 * saved `correct`, with the text "the arithmetic slipped to 0.31 instead of
 * 0.25", and the review closed as done. A final value that differs from the
 * right one is partly right at most: a `correct` attempt whose line names a
 * slip is refused, on a save and on a practice problem's conclude.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { saveCourse, type CourseToolContext } from "../src/agent/tools/course.ts";
import { concludeTool, createPracticeGate } from "../src/agent/tools/practice.ts";
import { newThinkingMessage, newUserMessage, type LhMessage } from "../src/core/native-messages.ts";

const O95 = "Set up $\\binom{10}{3}(1/4)^3(3/4)^7$ correctly, but the arithmetic slipped to $0.31$ instead of $0.25$";

function course(written: unknown[]): CourseToolContext {
	return {
		course: { workspace: "/pr", title: "Probability" },
		records: { run: async (_w: string, verb: { changes?: unknown }) => (written.push(verb.changes), { ok: true, json: { saved: ["o95"] } }) } as unknown as CourseToolContext["records"],
		arcs: false,
	};
}

test("a right mark on an answer whose line names a slip is refused (round 19, m1)", async () => {
	for (const text of [O95, "Got $0.31$ instead of $0.25$ from a rounding slip", "Right method; an arithmetic error gave $0.31$"]) {
		const written: unknown[] = [];
		const saved = await saveCourse(course(written), { observations: [{ topics: ["binomial"], text, response: "≈ 0.31", result: "correct", help: "none", sure: "confident" }] });
		assert.equal(saved.ok, false, text);
		assert.match(saved.ok ? "" : saved.message, /partial/);
		assert.deepEqual(written, []);
	}
});

test("the same line saved as partly right, and a right answer that names another method, pass", async () => {
	for (const observation of [
		{ topics: ["binomial"], text: O95, response: "≈ 0.31", result: "partial", help: "none" },
		{ topics: ["binomial"], text: "Used the complement instead of counting each case", response: "0.83", result: "correct", help: "none" },
	]) {
		const saved = await saveCourse(course([]), { observations: [observation] });
		assert.ok(saved.ok || !/slip/.test(saved.message), saved.ok ? "" : saved.message);
	}
});

test("a practice conclude marked right over a slip is refused", async () => {
	const pose = { id: "a_pose", role: "assistant", content: [{ type: "toolCall", id: "p1", name: "problem", arguments: { statement: "Ten 4-option guesses: P(exactly 3 right)?", mode: "recall", topics: ["binomial"], modelSolution: "$\\binom{10}{3}(1/4)^3(3/4)^7 \\approx 0.25$" } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
	const posed = { id: "r_pose", role: "toolResult", toolCallId: "p1", toolName: "problem", content: [{ type: "text", text: "Problem posed" }], isError: false, timestamp: 2 } as unknown as LhMessage;
	const messages = [newUserMessage("practice") as LhMessage, pose, posed, newThinkingMessage("p1", "120 × 0.015625 × 0.1335 ≈ 0.31", "confident") as LhMessage];
	const ctx = { chatId: "c", chatStore: { getChat: () => ({ messages }) } };
	const written: unknown[] = [];
	const result = await concludeTool(createPracticeGate(ctx), { ctx, course: course(written) }).execute("c1", { outcome: "solved", verdict: "Right setup; it comes to about 0.25, not 0.31.", rung: null, missClass: null, retest: false, result: "correct", response: "≈ 0.31", record: O95 } as never);
	assert.equal((result as { isError?: boolean }).isError, true);
	assert.match(result.content.map((c) => (c.type === "text" ? c.text : "")).join(""), /partial/);
	assert.deepEqual(written, []);
});
