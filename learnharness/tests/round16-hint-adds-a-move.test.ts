/**
 * Round 16, m12 (1 m9, 4 minor 2; round-15 m16, partly fixed). Two hints
 * gave him nothing new:
 * - lens 1 (30b): his draft read "-3x + 2y = 0 means y = 3x/2, so", and
 *   the hint said "In each vector (x, y) on this line, the second entry is
 *   3/2 times the first." The request never told the tutor that `text` was
 *   his draft, nor to go past it;
 * - lens 4 (30): under the nudge "What does R3 − R1 − R2 give you?", the
 *   first hint, told to "say where to look", said "Your suspicion about row
 *   3 is something you can check yourself, entry by entry, across all five
 *   columns.", his own idea handed back.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newPracticeRequestMessage, newUserMessage, PRACTICE_PROBLEM_TOOL, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { hintRungText, PRACTICE_REQUEST_TEXT } from "../src/core/contracts.ts";
import { compactAnswerForModel } from "../src/core/question-core.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const problem: ToolCall = { type: "toolCall", id: "p-1", name: PRACTICE_PROBLEM_TOOL, arguments: { statement: "Find $\\operatorname{rank} A$ by row reduction, and name the pivot columns.", mode: "recall", topics: ["rank"], modelSolution: "Row 3 is row 1 plus row 2, so the rank is 2." } };
const nudge: ToolCall = send("Finish the elimination and count the pivots, not the nonzero rows you started with. What does $R_3 - R_1 - R_2$ give you?");
const hinted = (): VoiceGuard =>
	new VoiceGuard([
		newUserMessage("Practice rank, the sheet 4 kind of problems."),
		{ ...fauxAssistantMessage(""), content: [problem], id: "a-1" } as LhMessage,
		{ id: "r-1", role: "toolResult", toolCallId: problem.id, toolName: PRACTICE_PROBLEM_TOOL, content: [{ type: "text", text: "Problem posed." }], isError: false, timestamp: 1 } as LhMessage,
		{ ...fauxAssistantMessage(""), content: [nudge], id: "a-2" } as LhMessage,
		newPracticeRequestMessage(problem.id, "hint"),
	]);
const rules = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

describe("a hint adds a move or a fact past his draft and the last nudge (round 16, m12)", () => {
	it("the recorded hint that hands his idea back is refused", () => {
		assert.equal(rules(hinted(), send("Your suspicion about row 3 is something you can check yourself, entry by entry, across all five columns.")), "hint-back");
	});

	it("a move past the nudge goes through", () => {
		assert.equal(rules(hinted(), send("Compare row 3 with row 1 plus row 2 one column at a time, starting from the left.")), null);
	});

	it("a check's hint tells the tutor his draft is his draft, and to go past it and the nudge", () => {
		const read = compactAnswerForModel({ kind: "explain", questionText: "Which vectors are the eigenvectors of $C$ for $\\lambda = 4$, and why?", options: [], answers: [], text: "-3x + 2y = 0 means y = 3x/2, so", hintRequested: true, answeredAt: "2026-11-08T10:00:00Z" });
		assert.equal(read.text, "-3x + 2y = 0 means y = 3x/2, so");
		assert.match(String(read.hintRequested), /`text`, when present, is his draft so far/);
		assert.match(String(read.hintRequested), /never his draft or your nudge said again in other words/);
	});

	it("a practice hint goes past his work and the nudge, and the first rung yields when he was told where to look", () => {
		assert.match(PRACTICE_REQUEST_TEXT.hint, /never his work or your nudge said again in other words, and never his own idea handed back/);
		assert.match(hintRungText(1), /When his work or your last message already says where to look, that rung is given/);
	});

	it("every agent's voice and ladder say so", () => {
		for (const agent of ["teacher", "practice"] as const) {
			assert.match(composeInstructions(agent), /a fact that neither the question, his draft nor your last message gave him/);
			assert.match(courseRecordPrompt(agent, { arcs: true }), /a rung that his own work or the last nudge already gave is skipped/);
		}
	});
});
