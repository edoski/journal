/**
 * Round 14, m16 (3 n6): the last probe answer read "Partly right" with no
 * words (26c). The probe ends with no words after `probe_done`, so its last
 * answer gets only its mark, and the teaching then built on without saying
 * what was missing (the model behind e⁻³). The wake that opens the lesson
 * now has the first step's first sentence name the part it missed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { buildProbeHandoffSteer } from "../src/core/contracts.ts";
import { newUserMessage, withProbeFeedback, type LhMessage } from "../src/core/native-messages.ts";

const recall: ToolCall = { type: "toolCall", id: "q-1", name: "recall", arguments: { question: "What does $(1 - 3/n)^n$ approach?", correctAnswer: "$e^{-3}$" } };
const answered = { id: "r-q-1", role: "toolResult", toolCallId: "q-1", toolName: "recall", content: [{ type: "text", text: "answer" }], details: { question: "q-1", kind: "explain", text: "1", questionText: "What does $(1 - 3/n)^n$ approach?", answers: ["1"], answeredAt: "2026-11-08T10:00:00Z" }, isError: false, timestamp: 1 } as LhMessage;
/** The probe asked, he answered, and the probe ended with no words. */
const markOnly: LhMessage[] = [newUserMessage("Poisson distribution"), { ...fauxAssistantMessage(""), content: [recall], id: "a-1" } as LhMessage, answered];

describe("the teaching names what the last probe answer missed (round 14, m16)", () => {
	it("the lesson's wake asks the first step's first sentence to name the missing part", () => {
		for (const review of [false, true]) {
			const steer = withProbeFeedback(buildProbeHandoffSteer("chat_1", review, false), markOnly);
			assert.match(String(steer.content), /My last probe answer got only its mark, with no words: when it was not right, the first step's first sentence names the part it missed/);
		}
	});
});
