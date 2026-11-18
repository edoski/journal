/**
 * Round 12, 2 n5: on Problem sheet 4, after part (d) the tutor's "Type
 * what part (e) asks." was refused as a point made twice ("said before as
 * Type what part (d) asks."), so the turn ended on "Part (e) is the last
 * part of the sheet." and asked him for nothing. An ask for his next move
 * is never a point made again: each one asks for something new.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const recall = (question: string): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "recall", arguments: { question } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const answered = (callId: string, text: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "recall", content: [{ type: "text", text }], details: { kind: "explain", text, answeredAt: "2026-11-08T21:00:00Z" }, isError: false, timestamp: 1 }) as LhMessage;
const withheld = (guard: VoiceGuard, call: ToolCall) => {
	guard.screen(call);
	return (guard as unknown as { decisions: Map<string, unknown> }).decisions.get(call.id) ?? null;
};

describe("an ask for his next move is never a repeat", () => {
	it("\"Type what part (e) asks.\" after \"Type what part (d) asks.\" is shown", () => {
		const c = recall("Show that $\\dim \\ker A = 2$.");
		const d = recall("Find a basis of $\\ker B$.");
		const turn = [
			newUserMessage("Continue Problem sheet 4: rank and nullity"),
			assistant([c]),
			answered(c.id, "5 - 3 = 2"),
			assistant([send("The kernel sits in $\\mathbb{R}^5$, so rank–nullity counts the 5 columns.\n\nType what part (d) asks.")]),
			newUserMessage("(d) Find a basis of ker B"),
			assistant([d]),
			answered(d.id, "(-2, 1, 0, 0) and (1, 0, -2, 1)"),
		];
		assert.equal(withheld(new VoiceGuard(turn), send("Type what part (e) asks.")), null);
	});

	it("a point said again is still refused", () => {
		const c = recall("Show that $\\dim \\ker A = 2$.");
		const turn = [newUserMessage("Kernel"), assistant([send("The kernel sits in the space of vectors the matrix acts on, so rank–nullity counts its columns.")]), assistant([c]), answered(c.id, "2")];
		assert.notEqual(withheld(new VoiceGuard(turn), send("Rank–nullity counts the columns, since the kernel sits in the space of vectors the matrix acts on.")), null);
	});
});
