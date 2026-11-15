/**
 * A question with a right answer is always the graded tool, never
 * `ask_user_question` (round 10, 2 m2): the teacher's planning doctrine and
 * the explain tool's `nodeId` description sent "off-map checks" to
 * `ask_user_question`, so a guess on diagonalization, off the eigen plan,
 * got "That's not right." with no card and no record. No text any agent
 * reads may send a check or a guess there.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sourcePromptTexts } from "../src/agent/prompt-segments.ts";
import { explainInputObject } from "../src/core/question-core.ts";

/** The sentences that send a check, a guess or a prediction to the
 *  untracked question tool. */
function sendsChecksToAsk(text: string): string[] {
	return text
		.split(/(?<=[.!?])\s+/)
		.filter((sentence) => /\b(?:checks?|guess(?:es)?|predictions?)\b/i.test(sentence) && /\buse\s+`?ask_user_question\b/i.test(sentence));
}

describe("a question with a right answer", () => {
	it("is never sent to ask_user_question by any agent's prompt", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) {
			assert.deepEqual(sendsChecksToAsk(sourcePromptTexts(agent).join("\n")), [], agent);
		}
	});

	it("is never sent there by the explain tool's node tag", () => {
		const description = String((explainInputObject.properties.nodeId as { description?: string }).description ?? "");
		assert.deepEqual(sendsChecksToAsk(description), []);
		assert.match(description, /ask_user_question never asks one/);
	});

	it("is the graded tool even off the plan, in the teacher's planning doctrine", () => {
		assert.match(sourcePromptTexts("teacher").join("\n"), /`explain` even off the plan[^.]*`ask_user_question` never asks one/);
	});
});
