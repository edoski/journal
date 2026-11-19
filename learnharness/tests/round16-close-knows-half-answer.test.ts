/**
 * Round 16, m13 (4 minor 5, 45-done-half-after): Done for today with a
 * half answer in the box closed on "You still haven't started Linear maps
 * and their matrices. When you come back to it, you pick up the first
 * question, which is still open.", under the bubble that showed his half
 * answer. The dismissal the tutor read never said one was kept (round 15
 * hid the draft's words, rightly, and with them the fact).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { tonightAppends } from "../src/core/input-events.ts";
import { DONE_TONIGHT_TEXT } from "../src/core/contracts/chat.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { voiceBreaks } from "../src/core/voice-check.ts";

const ask: ToolCall = { type: "toolCall", id: "q1", name: "recall", arguments: { question: "A linear map $T$ satisfies $T(1,1) = (2,0)$ and $T(1,-1) = (0,4)$. What is the matrix of $T$ in the standard basis, and why?", correctAnswer: "Columns T(e1) = (1,2) and T(e2) = (1,-2)." } };
const asked: LhMessage[] = [newUserMessage("Linear maps and their matrices"), { ...fauxAssistantMessage(""), content: [ask], id: "a-1" } as LhMessage];
const readOf = (draft?: string): string => {
	const left = tonightAppends({ messages: asked }, draft ? { toolCallId: "q1", text: draft } : undefined)[0] as Extract<LhMessage, { role: "toolResult" }>;
	return left.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
};

describe("the close knows he left a half answer (round 16, m13)", () => {
	it("the tutor reads that a half answer was kept, never its words", () => {
		const read = readOf("e1 = ((1,1) + (1,-1))/2 so T(e1) = (1,2), and T(e2) =");
		assert.match(read, /"draftKept"/);
		assert.match(read, /his half answer, waiting in this session by its name/);
		assert.doesNotMatch(read, /T\(e1\) = \(1,2\)/);
	});

	it("an empty box says nothing of one", () => {
		assert.doesNotMatch(readOf(), /draftKept/);
	});

	it("every close is told to name it as waiting", () => {
		for (const agent of ["prober", "teacher"] as const) assert.match(DONE_TONIGHT_TEXT[agent], /a question he left a half answer on \(`draftKept`\) is his half answer, waiting in this session by its name/);
	});

	it("the recorded close is refused, and the one it asks for passes", () => {
		const rules = (text: string) => voiceBreaks(text, "close").map((b) => b.rule);
		assert.ok(rules("You still haven't started Linear maps and their matrices. When you come back to it, you pick up the first question, which is still open.").includes("not-yet"));
		assert.ok(!rules("Your half answer to the first question waits here for next time.").includes("not-yet"));
	});
});
