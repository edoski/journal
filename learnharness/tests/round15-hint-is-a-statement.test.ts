/**
 * Round 15, m16 (4 minor 2; round-14 m17, not fixed): on Rank practice,
 * Hint gave "Does a row of $A$ with nonzero entries still have to be
 * nonzero once elimination is done?", the problem again in other words
 * (`30`). Round 14 fixed a check's hint only: the practice request still
 * asked for "one question that points at where to look", the ladder said
 * "first a question", and the guard read no practice hint as a hint.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newPracticeRequestMessage, newUserMessage, PRACTICE_PROBLEM_TOOL, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { hintRungText } from "../src/core/contracts.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const problem: ToolCall = { type: "toolCall", id: "p-1", name: PRACTICE_PROBLEM_TOOL, arguments: { statement: "Find $\\operatorname{rank} A$ by row reduction.", mode: "recall", topics: ["rank"], modelSolution: "Row 3 is row 1 plus row 2, so the rank is 2." } };
const hinted = (): VoiceGuard =>
	new VoiceGuard([
		newUserMessage("Practice rank, the sheet 4 kind of problems."),
		{ ...fauxAssistantMessage(""), content: [problem], id: "a-1" } as LhMessage,
		{ id: "r-1", role: "toolResult", toolCallId: problem.id, toolName: PRACTICE_PROBLEM_TOOL, content: [{ type: "text", text: "Problem posed." }], isError: false, timestamp: 1 } as LhMessage,
		newPracticeRequestMessage(problem.id, "hint", "Every row has nonzero entries so I want to say rank 3"),
	]);
const rules = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

describe("a practice hint says what the problem did not (round 15, m16)", () => {
	it("the recorded hint, the problem asked again as a question, is refused", () => {
		assert.equal(rules(hinted(), send("Does a row of $A$ with nonzero entries still have to be nonzero once elimination is done?")), "hint-question");
	});

	it("a pointer said as a statement goes through", () => {
		assert.equal(rules(hinted(), send("Look at what row 3 becomes once rows 1 and 2 are taken off it.")), null);
	});

	it("the first rung asks for a statement, never a question", () => {
		assert.doesNotMatch(hintRungText(1), /ask him one question/);
		assert.match(hintRungText(1), /never a question and never the problem in other words/);
	});

	it("the ladder every agent reads starts with a statement of where to look", () => {
		for (const agent of ["teacher", "practice"] as const) {
			const prompt = courseRecordPrompt(agent, { arcs: true });
			assert.doesNotMatch(prompt, /first a question that points/);
			assert.match(prompt, /first a statement of what to look at, never a question/);
		}
	});
});
