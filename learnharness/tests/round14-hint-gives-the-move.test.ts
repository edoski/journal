/**
 * Round 14, m17 (4 minor 8): the hint only rephrased the question. "What
 * does R3 − R1 − R2 give you?" became "What happens to row 3 during
 * elimination if it really is row 1 plus row 2?" (30). The ladder's first
 * rung was "a question pointing where to look". A hint now gives what the
 * question did not, as a statement: the next move, or a fact it left out.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const open: ToolCall = { type: "toolCall", id: "q-open", name: "explain", arguments: { type: "check", nodeId: "rank", question: "What does $R_3 - R_1 - R_2$ give you, and why?", correctAnswer: "A zero row." } };
const hinted = (): VoiceGuard =>
	new VoiceGuard([
		newUserMessage("Determinants"),
		{ ...fauxAssistantMessage(""), content: [open], id: "a-1" } as LhMessage,
		{ id: "r-1", role: "toolResult", toolCallId: open.id, toolName: "explain", content: [{ type: "text", text: "hint" }], details: { kind: "explain", hintRequested: true }, isError: false, timestamp: 1 } as LhMessage,
	]);
const rules = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

describe("a hint gives the next move (round 14, m17)", () => {
	it("the recorded hint, the question asked again in other words, is refused", () => {
		assert.equal(rules(hinted(), send("What happens to row 3 during elimination if it really is row 1 plus row 2?")), "hint-question");
	});

	it("a move or a fact the question did not give goes through", () => {
		assert.equal(rules(hinted(), send("Write row 3 as row 1 plus row 2 and subtract both.")), null);
		assert.equal(rules(hinted(), send("Think about what a vector on this line has to do to the left side of the equation.")), null);
	});

	it("the ladder says a hint is a statement, never a question", () => {
		const teacher = composeInstructions("teacher");
		assert.doesNotMatch(teacher, /first a question pointing where to look/);
		assert.match(teacher, /never the question again in other words or a new question/);
	});
});
