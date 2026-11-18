/**
 * Round 15, the tutor's lines that tell him nothing:
 * - m14 (3 m4): "Your rank problem on the matrix M is still open above.",
 *   directly under M (`41`). Its cause is a practice run twice
 *   (round15-handoff-rewrite.test.ts); a pointer to the problem right
 *   above is refused too.
 * - m17 (4 minor 1, 4 minor 7): "Your answer on D arrived." (`99`) and "My
 *   earlier line saying the set was done was wrong, since one problem is
 *   not a set." (`69`).
 * - m18 (2 n5): "The mark stands as With help" (`20`).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { voiceBreaks } from "../src/core/voice-check.ts";
import { disputeText } from "../src/core/contracts.ts";
import { newModeHandoffMessage, newUserMessage, PRACTICE_PROBLEM_TOOL, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (id: string, ...content: ToolCall[]) => ({ ...fauxAssistantMessage(""), content, id }) as LhMessage;
const result = (call: ToolCall, text: string, details: unknown = null, isError = false) =>
	({ id: `r-${call.id}`, role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text }], details, isError, timestamp: 1 }) as LhMessage;
const rules = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};


describe("no pointer to the problem right above (round 15, m14)", () => {
	const problem: ToolCall = { type: "toolCall", id: "p-m", name: PRACTICE_PROBLEM_TOOL, arguments: { statement: "Find $\\operatorname{rank} M$.", mode: "recall", topics: ["rank"], modelSolution: "2" } };
	const posed: LhMessage[] = [newUserMessage("Practice rank."), assistant("a-1", problem), result(problem, "Problem posed.")];

	it("the recorded pointer, with the problem the last thing he read, is refused", () => {
		const guard = new VoiceGuard([...posed, newModeHandoffMessage("chat", "h-1", "practice")]);
		assert.equal(rules(guard, send("Your rank problem on the matrix $M$ is still open above.")), "pointer");
	});

	it("after a reply he read below the problem, the pointer says where it is", () => {
		const said = send("The kernel holds vectors with 5 entries.");
		const guard = new VoiceGuard([...posed, assistant("a-2", said), result(said, "Message received for display."), newModeHandoffMessage("chat", "h-1", "practice")]);
		assert.equal(rules(guard, send("Your rank problem on the matrix $M$ is still open above.")), null);
	});
});

describe("no arrival lines and no talk of its own earlier words (round 15, m17)", () => {
	it("refuses the recorded lines", () => {
		assert.deepEqual(voiceBreaks("Your answer on $D$ arrived.").map((b) => b.rule), ["arrival"]);
		assert.deepEqual(voiceBreaks("My earlier line saying the set was done was wrong, since one problem is not a set.").map((b) => b.rule), ["own-words"]);
		assert.deepEqual(voiceBreaks("I got your answer.").map((b) => b.rule), ["arrival"]);
	});

	it("lets maths and a plain correction of fact through", () => {
		assert.deepEqual(voiceBreaks("The answer arrives at $e^{-6}$ once the exponent is written as $3n$."), []);
		assert.deepEqual(voiceBreaks("This problem is the first of the set."), []);
	});
});

describe("his card's words are lowercase inside a sentence (round 15, m18)", () => {
	it("refuses the recorded ruling, in his reply and in the saved ruling", () => {
		const ruling = 'The mark stands as With help: before the hint you wrote "but P(5)?", and the hint gave the 6 places for the miss.';
		assert.ok(voiceBreaks(ruling).some((b) => b.rule === "mark-case"));
		const dispute = { role: "custom", customType: "dispute", content: "", display: true, details: {}, id: "d-1", timestamp: 1 } as unknown as LhMessage;
		const guard = new VoiceGuard([newUserMessage("Binomial"), dispute], undefined, false, true);
		const save: ToolCall = { type: "toolCall", id: "save-1", name: "course_save", arguments: { changes: { observations: [{ question: "q", topics: ["binomial"], result: "correct", help: "Hint", corrects: ["o17"], disputed: "Should be on my own", ruling }] } } };
		assert.equal(rules(guard, save), "mark-case");
	});

	it("lets the lowercase words, a sentence's first word and a quoted card word through", () => {
		assert.deepEqual(voiceBreaks("The mark stays with help: the hint gave the 6 places for the miss."), []);
		assert.deepEqual(voiceBreaks("On your own, you found the complement."), []);
		assert.deepEqual(voiceBreaks('His card reads "With help".'), []);
	});

	it("the dispute marker asks for the card's words lowercase", () => {
		assert.match(disputeText({ observations: ["o17"], said: "The hint didn't really help", proposedHow: "ownWork" }, "Q"), /lowercase inside a sentence/);
	});
});
