/**
 * The reply and his card's Disputed stamp say one ruling (round 13,
 * 2 n6): the reply said "so the answer counts as given after help", and
 * the stamp, which shows the saved `ruling`, said "so your answer came
 * after help on the very part that was missing". The words are the lens's.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const save = (ruling: string): ToolCall => ({ type: "toolCall", id: `save-${++n}`, name: "course_save", arguments: { changes: { observations: [{ topics: ["kernel"], result: "correct", help: "hint", corrects: ["o31"], ruling }] } } });
const dispute = (): LhMessage => ({ id: `d-${++n}`, role: "custom", customType: "dispute", content: "[MARK DISPUTED]", display: true, details: {}, timestamp: 1 }) as LhMessage;
const turn = () => [newUserMessage("Kernel practice"), { ...fauxAssistantMessage(""), id: "a1", content: [send("A step.")] } as LhMessage, dispute()];
const withheld = (guard: VoiceGuard, call: ToolCall) => {
	guard.screen(call);
	return (guard as unknown as { decisions: Map<string, { details: { withheld: string } } | null> }).decisions.get(call.id) ?? null;
};

const STAMP = "The mark stays Right, With help: the hint gave you the free variable, so your answer came after help on the very part that was missing.";
const REPLY = "The mark stays Right, With help. The hint named the free variable, so the answer counts as given after help.";

describe("one ruling, in the reply and on his card (2 n6)", () => {
	it("refuses a reply that words the saved ruling differently", () => {
		const guard = new VoiceGuard(turn(), undefined, false, true);
		assert.equal(withheld(guard, save(STAMP)), null);
		assert.equal(withheld(guard, send(REPLY))?.details.withheld, "ruling-said");
	});

	it("refuses a save whose ruling words the reply differently", () => {
		const guard = new VoiceGuard(turn(), undefined, false, true);
		assert.equal(withheld(guard, send(REPLY)), null);
		assert.equal(withheld(guard, save(STAMP))?.details.withheld, "ruling-said");
	});

	it("passes the same words, whichever comes first", () => {
		const first = new VoiceGuard(turn(), undefined, false, true);
		assert.equal(withheld(first, save(STAMP)), null);
		assert.equal(withheld(first, send(STAMP)), null);
		const second = new VoiceGuard(turn(), undefined, false, true);
		assert.equal(withheld(second, send(STAMP)), null);
		assert.equal(withheld(second, save(STAMP)), null);
	});
});
