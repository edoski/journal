/**
 * Round 12, 2 n5: a dispute ruling read "The mark stays Partly right, on
 * your own, sure." while his card says "Confident". A ruling words his
 * confidence as the card does, "Guessing" or "Confident", never the
 * record's "sure" or "guess".
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { disputeText } from "../src/core/contracts/chat.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const save = (ruling: string): ToolCall => ({ type: "toolCall", id: `save-${++n}`, name: "course_save", arguments: { changes: { observations: [{ topics: ["binomial"], result: "partial", sure: "confident", corrects: ["o18"], ruling }] } } });
const dispute = (): LhMessage => ({ id: `d-${++n}`, role: "custom", customType: "dispute", content: "[MARK DISPUTED]", display: true, details: {}, timestamp: 1 }) as LhMessage;
const turn = () => [newUserMessage("Binomial review"), { ...fauxAssistantMessage(""), id: "a1", content: [send("A step.")] } as LhMessage, dispute()];
const withheld = (guard: VoiceGuard, call: ToolCall) => {
	guard.screen(call);
	return (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld: string } } | null> }).decisions.get(call.id) ?? null;
};

describe("a ruling words his confidence as his card does", () => {
	it("the recorded ruling is refused", () => {
		const refused = withheld(new VoiceGuard(turn(), undefined, true, true), send("The mark stays Partly right, on your own, sure. You wrote $0.2 \\cdot 0.8^5 \\approx 0.066$, so the arithmetic was done without the 6."));
		assert.deepEqual(refused?.details.rules, ["mark-case", "card-words"], "and its capitals mid-sentence (round 15, m18)");
	});

	it("the same words in the save's ruling are refused", () => {
		const refused = withheld(new VoiceGuard(turn(), undefined, true, true), save("The mark stays Partly right, on your own, sure."));
		assert.equal(refused?.details.withheld, "card-words");
	});

	it("the card's own words pass, lowercase inside the sentence (round 15, m18)", () => {
		const guard = new VoiceGuard(turn(), undefined, true, true);
		assert.equal(withheld(guard, save("The mark stays partly right, on your own, confident.")), null);
		assert.equal(withheld(guard, send("The mark stays partly right, on your own, confident. You wrote $0.328$, so the sum was worked without the 6.")), null);
	});

	it("the dispute names the card's confidence words", () => {
		assert.match(disputeText({ observations: ["o18"] }, "What is P(X ≤ 1)?"), /"Guessing"[^.]*"Confident"/);
	});
});
