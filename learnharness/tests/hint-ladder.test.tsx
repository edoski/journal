/**
 * Hints climb a ladder: a Hint press on a check is a request, never an
 * answer, so the committed answer (a whole proof, say) stays hidden, and
 * every agent that teaches reads the same ladder.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAnswer, compactAnswerForModel, type QuestionData } from "../src/core/question-core.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

const PROOF = "Suppose $e$ and $e'$ are both identities. Then $e = ee' = e'$.";
const check: QuestionData = { id: "q1", kind: "explain", question: "Prove the identity is unique.", mode: "text", options: [], committedAnswer: PROOF, createdAt: "2026-11-13T20:00:00Z" };

describe("a Hint press on a check", () => {
	it("is saved as a hint request with no committed answer and no confidence", () => {
		const answer = buildAnswer(check, { text: "take two identities?", hint: true }, "recall");
		assert.equal(answer.hintRequested, true);
		assert.equal(answer.committed, undefined);
		assert.equal(answer.confidence, undefined);
	});

	it("tells the agent it is a request for the next rung, not an answer", () => {
		const model = compactAnswerForModel(buildAnswer(check, { text: "stuck", hint: true }, "recall"));
		assert.match(String(model.hintRequested), /not an answer.*next rung/);
	});
});

describe("the ladder in every teaching prompt", () => {
	for (const agent of ["teacher", "practice"] as const) {
		it(`${agent}: hints climb from where to look to a nudge to a step, and only show me reveals the rest`, () => {
			const prompt = courseRecordPrompt(agent, { arcs: true });
			assert.match(prompt, /first a statement of what to look at, never a question and never the problem in other words.*then a nudge.*then one step/s);
			assert.match(prompt, /never gives the whole solution or the whole proof\. Only "show me" reveals the rest/);
		});
	}
	it("prober and teacher: a hint request on a check is never answered with the committed answer", () => {
		for (const agent of ["prober", "teacher"] as const) {
			assert.match(composeInstructions(agent), /A hint request is not an answer.*never the committed answer, never the proof/s);
		}
	});
});
