/**
 * A question typed into the answer box is answered as a question (fix
 * round 18, found live by its integrator): "wait, what does homomorphism
 * mean exactly?" sent from a review question's answer box was graded and
 * saved as an attempt, and the re-asked question's answer was saved as
 * helped. Every agent that grades reads that such words are his question:
 * no grade, no attempt, the same check asked again, and the reply to his
 * question is no help on it. In practice it is no claim and no hint rung.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

describe("a question typed into the answer box", () => {
	for (const agent of ["prober", "teacher"] as const) {
		it(`${agent}: is his question, never graded or recorded, and the same check is asked again`, () => {
			assert.match(composeInstructions(agent), /A question is not an answer\.\*\* Words sent as his answer that ask you something and attempt nothing .*grade nothing, record no attempt, and ask the same check again with a fresh call, word for word\. The check is still unanswered, and your reply to his question is no help on it\./s);
		});
	}

	it("the record rule: an answer box that only asks is no attempt, and the reply to it is no help", () => {
		const prompt = courseRecordPrompt("teacher", { arcs: true });
		assert.match(prompt, /an answer that only asks you something, from Ask or typed in the answer box, is no attempt and is not saved/);
		assert.match(prompt, /Your teaching, your answer to a question he asked you, a worked example of another problem, and an earlier question's answer are not help/);
	});

	it("practice: a question in his work is no claim and no hint request, and the problem stays open", () => {
		assert.match(composeInstructions("practice"), /A question to you that attempts nothing .*It is no claim and no hint request: no verdict, no rung, no attempt, and the problem stays open as it was\./s);
	});
});
