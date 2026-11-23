/**
 * Round 20, M4 (b) (2 n3 b): the Homomorphisms review inside Problem sheet
 * 4. `course_save` returned "save did not finish in time", the engine had
 * written o134, and no mark showed, even after a reload, until his next
 * answer: a save links an answer to its mark only through its receipt, and
 * a timed-out save has none. The app now sends a timed-out save again
 * once, identical; the engine takes it as the save it already holds
 * (`saved` names the duplicate), and the answer is linked.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saveCourse, type CourseToolContext } from "../src/agent/tools/course.ts";
import type { CourseResult, CourseVerb } from "../src/core/contracts/course.ts";
import { answeredQuestionsOf, type LhMessage } from "../src/core/native-messages.ts";

const question: LhMessage[] = [
	{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "q_hom", name: "explain", arguments: { type: "check", nodeId: "n", question: "Is T(x) = 2x a homomorphism?", correctAnswer: "yes" } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage,
	{ id: "r1", role: "toolResult", toolCallId: "q_hom", toolName: "explain", content: [{ type: "text", text: "{}" }], details: { kind: "explain", tool: "explain", questionText: "Is T(x) = 2x a homomorphism?", answers: [], text: "yes, T(a+b) = T(a)+T(b)", answeredAt: "" }, isError: false, timestamp: 2 } as unknown as LhMessage,
];
const attempt = { topics: ["homomorphism"], text: "Checked T(a+b) = T(a)+T(b) for T(x) = 2x", response: "yes", help: "none", result: "correct", question: "q_hom" };
const TIMED_OUT: CourseResult = { ok: false, kind: "io", message: "save did not finish in time; a write may have completed, and repeating the identical save is safe", timedOut: true };

function context(results: CourseResult[]) {
	const runs: CourseVerb[] = [];
	const kept: { question: string; observation: string }[][] = [];
	const ctx: CourseToolContext = {
		course: { workspace: "/study/la", title: "Linear Algebra" },
		records: { run: async (_w: string, verb: CourseVerb) => (runs.push(verb), results.shift()!) } as unknown as CourseToolContext["records"],
		arcs: false,
		answers: answeredQuestionsOf(question),
		onSaved: (links) => kept.push(links),
	};
	return { ctx, runs, kept };
}

describe("a save that timed out", () => {
	it("is sent again once, identical, and the engine's receipt links the answer to its mark", async () => {
		const { ctx, runs, kept } = context([TIMED_OUT, { ok: true, json: { observations: [], duplicates: ["o134"], saved: ["o134"], notes: [] } }]);
		const result = await saveCourse(ctx, { observations: [attempt] });
		assert.equal(result.ok, true);
		assert.equal(runs.length, 2);
		assert.deepEqual(runs[1], runs[0], "the same save");
		assert.deepEqual(kept, [[{ question: "q_hom", observation: "o134" }]]);
	});

	it("a save that went through, or was refused, runs once", async () => {
		const done = context([{ ok: true, json: { observations: ["o134"], saved: ["o134"], notes: [] } }]);
		await saveCourse(done.ctx, { observations: [attempt] });
		assert.equal(done.runs.length, 1);
		const refused = context([{ ok: false, kind: "validation", message: "observations[0].topics: unknown topic" }]);
		await saveCourse(refused.ctx, { observations: [attempt] });
		assert.equal(refused.runs.length, 1);
	});

	it("timing out twice tells the tutor what one timeout did", async () => {
		const { ctx, runs } = context([TIMED_OUT, TIMED_OUT]);
		const result = await saveCourse(ctx, { observations: [attempt] });
		assert.equal(runs.length, 2);
		assert.equal(result.ok, false);
	});
});
