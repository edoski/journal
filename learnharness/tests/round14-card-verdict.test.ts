/**
 * Round 14, m19 (1 n10, also 2 step 17): "That's not right." under a "Not
 * right" card. His answer card shows the verdict above the reply, so an
 * opening that says it again only restates the card. The voice prompt
 * asked for it ("A wrong answer is named plainly (\"that's not right\")").
 * The guard refuses an opening that restates the verdict the turn saved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";

let n = 0;
const explain = (question: string): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "explain", arguments: { question, type: "check", nodeId: "eigenline", correctAnswer: "(1, -2)" } });
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const save = (question: string, result: string): ToolCall => ({ type: "toolCall", id: `v-${++n}`, name: "course_save", arguments: { changes: { observations: [{ question, topics: ["eigen"], text: "Took the coefficients as the vector", response: "(1,2)", help: "none", result }] } } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const answered = (callId: string, text: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text }], details: { kind: "explain", text, answeredAt: "2026-11-08T21:00:00Z" }, isError: false, timestamp: 1 }) as LhMessage;
const rules = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

function afterAnswer(): { guard: VoiceGuard; question: string } {
	const open = explain("Which vector spans the eigenline for $\\lambda = 6$, and why?");
	const guard = new VoiceGuard([newUserMessage("Eigenvalues and eigenvectors"), assistant([open]), answered(open.id, "(1,2)")]);
	return { guard, question: open.id };
}

describe("an opening never restates his card's verdict (round 14, m19)", () => {
	it("the recorded reply, \"That's not right.\" under a Not right card, is refused", () => {
		const { guard, question } = afterAnswer();
		assert.equal(rules(guard, save(question, "incorrect")), null);
		assert.equal(rules(guard, send("That's not right. The vector $(1,2)$ does not satisfy it, since $-1+4=3$.")), "card");
	});

	it("\"Partly right\" said again under a Partly right card is refused too", () => {
		const { guard, question } = afterAnswer();
		rules(guard, save(question, "partial"));
		assert.equal(rules(guard, send("Partly right. The direction is right, but the vector is not on the line.")), "card");
	});

	it("an opening on where it broke goes through", () => {
		const { guard, question } = afterAnswer();
		rules(guard, save(question, "incorrect"));
		assert.equal(rules(guard, send("The vector $(1,2)$ does not satisfy it, since $-1+4=3$. You took the coefficients as the vector.")), null);
	});

	it("with no card above it, the words are the verdict and go through", () => {
		const { guard } = afterAnswer();
		assert.equal(rules(guard, send("That's not right. The vector $(1,2)$ does not satisfy it, since $-1+4=3$.")), null);
	});

	it("the voice no longer asks for the verdict in words", () => {
		const teacher = composeInstructions("teacher");
		assert.doesNotMatch(teacher, /A wrong answer is named plainly \("that's not right"\)/);
		assert.match(teacher, /never open by saying it again \("That's not right\."\)/);
	});
});
