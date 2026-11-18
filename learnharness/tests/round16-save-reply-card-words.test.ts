/**
 * Round 16, m14 (4 minor 7, 73): asked "the record works again, can you
 * save my answers now?", the tutor replied "The first … is marked
 * incorrect and sure. The second … is marked correct with help." over
 * cards reading "Not right · On your own · Confident" and "Right · With
 * help". Round 12 held a ruling to the card's words; any reply naming a
 * mark now is.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, SEND_TO_USER_TOOL } from "../src/core/native-messages.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const rules = (message: string): string[] | null => {
	const guard = new VoiceGuard([newUserMessage("the record works again, can you save my answers now?")], undefined, false, true);
	const call = send(message);
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[] } } | null> }).decisions.get(call.id);
	return refused?.details.rules ?? null;
};

describe("a reply names a mark in his card's words (round 16, m14)", () => {
	it("the recorded save reply is refused", () => {
		assert.ok(rules("Both answers to the series problem are recorded now. The first, $p > 0$ by comparison, is marked incorrect and sure. The second, by the integral test after the hint, is marked correct with help.")?.includes("card-words"));
	});

	it("the card's words pass", () => {
		assert.equal(rules("Both answers to the series problem are in your record now. The first, $p > 0$ by comparison, is not right, and you were confident. The second, by the integral test after the hint, is right with help."), null);
	});

	it("an ordinary \"incorrect\" in teaching is left alone", () => {
		assert.equal(rules("The comparison with $1/n^{1+p}$ is incorrect for small $n$, since the inequality turns round below $e$."), null);
	});

	it("the course record says so for every mark he is told", () => {
		assert.match(courseRecordPrompt("practice", { arcs: true }), /A mark you name \(telling him what you saved, a ruling\) is his card's words in lowercase/);
	});
});
