/**
 * Practice's closing words add what the feedback did not say, and never
 * tell him how sure he was (round 10, 3 m3): after "the break is the 3 you
 * subtracted from", the close read "You were sure the kernel came from the
 * number of rows. Rank–nullity subtracts the rank from the number of
 * columns." His card already shows his confidence.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { narratedConfidence } from "../src/core/voice-check.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { sourcePromptTexts } from "../src/agent/prompt-segments.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const thinking = (text: string): LhMessage => ({ id: `t-${++n}`, role: "custom", customType: "practice-thinking", content: `Your thinking: ${text}`, display: true, details: {}, timestamp: 1 }) as LhMessage;

function rulesOfClose(close: string): string[] {
	const turn = [newUserMessage("Rank practice"), assistant([send("Part (a) is right. Part (b) is not: the break is the 3 you subtracted from.")]), thinking("dim ker = 5 - 2 = 3")];
	const guard = new VoiceGuard(turn);
	guard.screen({ type: "toolCall", id: `c-${++n}`, name: "conclude", arguments: { result: "correct" } });
	const call = send(close);
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[] } } | null> }).decisions.get(call.id);
	return refused?.details.rules ?? [];
}

describe("practice's closing words", () => {
	it("never tell him how sure he was", () => {
		assert.ok(rulesOfClose("You were sure the kernel came from the number of rows. Rank–nullity subtracts the rank from the number of columns.").includes("confidence"));
		assert.equal(narratedConfidence("You felt confident it was 3. It is 2."), "You felt confident it was 3.");
		assert.equal(narratedConfidence("You can be sure of one thing: the columns."), null);
	});

	it("pass when they hold only the move that was not obvious", () => {
		assert.deepEqual(rulesOfClose("The kernel lives in the space $x$ comes from, so its dimension is columns minus rank."), []);
	});

	it("are told so in the voice every agent reads and in practice's own instructions", () => {
		assert.match(sourcePromptTexts("practice").join("\n"), /never what your feedback already said and never how sure he was/);
		for (const agent of ["prober", "teacher", "practice"] as const) assert.match(sourcePromptTexts(agent).join("\n"), /Never how sure he was/, agent);
	});
});
