/**
 * Round 14, m18 (2 n5): "In the demo, press Play and compare the length
 * ratio at each green direction with the two roots you found for $A$." He
 * had found $C$'s roots (1 and 6); $A$'s were the tutor's. A reply that
 * credits him with work names the matrix he worked on: the one in his own
 * words or in the question his answer replies to.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { creditedLetter } from "../src/core/voice-check.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";

let n = 0;
const explain = (question: string, type: "check" | "predict" = "check"): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "explain", arguments: { question, type, nodeId: "compute", correctAnswer: "x" } });
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const answered = (callId: string, text: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text }], details: { kind: "explain", text, answeredAt: "2026-11-08T21:00:00Z" }, isError: false, timestamp: 1 }) as LhMessage;
const rules = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

/** The recorded lesson: a prediction about A, then the eigenvalues of C, answered. */
function recorded(): VoiceGuard {
	const predict = explain("Take the matrix $A$ with rows $(2, 1)$ and $(1, 2)$. Which two directions do you expect to stay on their own line?", "predict");
	const check = explain("What are the eigenvalues of the matrix $C$ with rows $(5, 2)$ and $(2, 2)$, and why?");
	return new VoiceGuard([
		newUserMessage("Eigenvalues and eigenvectors"),
		assistant([predict]),
		answered(predict.id, "I guess the x axis and the y axis, each stretched by 2"),
		assistant([check]),
		answered(check.id, "trace 7, det 10 - 4 = 6, so lambda^2 - 7 lambda + 6 = (lambda - 1)(lambda - 6). Eigenvalues 1 and 6"),
	]);
}

describe("a reply credits him only with his own work (round 14, m18)", () => {
	it("the recorded \"the two roots you found for $A$\" is refused", () => {
		assert.equal(rules(recorded(), send("In the demo, press Play and compare the length ratio at each green direction with the two roots you found for $A$.")), "credit");
	});

	it("the matrix he worked on goes through", () => {
		assert.equal(rules(recorded(), send("For each root you found for $C$, the matrix $C - \\lambda I$ has determinant zero.")), null);
	});

	it("a matrix he named in his own words counts as his", () => {
		assert.equal(creditedLetter("The kernel you found for $B$ is a line.", ["B has rank 1, so its kernel is a line"]), null);
		assert.equal(creditedLetter("The kernel you found for $B$ is a line.", ["rank 1, so the kernel is a line"])?.letter, "B");
	});
});
