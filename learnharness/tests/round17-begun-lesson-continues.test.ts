/**
 * Round 17, m19 (4 minor 6; round-16 m13's remainder): Done for today
 * closed a lesson he began that morning on "Your half answer on the linear
 * map question waits for you in Linear maps and their matrices, which you
 * start tomorrow, Monday 9 November." Once the session has asked him
 * anything, its lesson has begun: its close says it continues.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

const LENS = "Your half answer on the linear map question waits for you in Linear maps and their matrices, which you start tomorrow, Monday 9 November.";
let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const rules = (guard: VoiceGuard, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};
const done = { id: "d1", role: "custom", customType: "done-tonight", content: "[DONE FOR TODAY]", display: false, details: {}, timestamp: 2 } as LhMessage;

function closing(review = false, asked = true): VoiceGuard {
	const q: ToolCall = { type: "toolCall", id: `q-${++n}`, name: "recall", arguments: { question: "What is $h(3,1)$, and why?" } };
	return new VoiceGuard([newUserMessage("Linear maps and their matrices"), assistant(asked ? [q] : [send("A linear map is fixed by a basis.")]), done], undefined, review);
}

describe("a lesson begun today continues at its close (round 17, m19)", () => {
	it("the lens's close is refused, and the same close with continue goes through", () => {
		assert.ok(rules(closing(), send(LENS)).includes("begun"));
		assert.ok(!rules(closing(), send(LENS.replace("which you start", "which you continue"))).includes("begun"));
	});

	it("a session that asked nothing yet, and a review, are left alone", () => {
		assert.ok(!rules(closing(false, false), send(LENS)).includes("begun"));
		assert.ok(!rules(closing(true), send("Kernel and rank-nullity, which you start tomorrow, Monday 9 November, comes next.")).includes("begun"));
	});

	it("the course prompt says a lesson that has asked him anything continues", () => {
		assert.match(courseRecordPrompt("teacher", { arcs: true }), /So is the lesson of this session once it has asked him anything, its probe included/);
	});
});
