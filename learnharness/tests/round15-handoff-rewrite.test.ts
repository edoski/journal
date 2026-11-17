/**
 * Round 15, m14 (3 m4): "Your rank problem on the matrix M is still open
 * above.", directly under M (`41`). The teacher handed to practice beside
 * a message the voice guard refused, and the rewrite ended the turn, so
 * the record ended on the rewrite and owed a continuation. The
 * continuation ran practice, which posed M, then the handoff's wake ran
 * practice again, and it pointed at M.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { needsContinuation, newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";

const assistant = (id: string, ...content: ToolCall[]) => ({ ...fauxAssistantMessage(""), content, id }) as LhMessage;
const result = (call: ToolCall, text: string, details: unknown = null, isError = false) =>
	({ id: `r-${call.id}`, role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text }], details, isError, timestamp: 1 }) as LhMessage;
const recall: ToolCall = { type: "toolCall", id: "q-1", name: "recall", arguments: { question: "A $6 \\times 4$ matrix $C$ has rank $2$. What is $\\dim \\ker C$, and why?", correctAnswer: "2" } };
const answered = result(recall, "answer", { question: "q-1", kind: "explain", text: "dim ker C = 4 - 2 = 2", confidence: "guessing", questionText: recall.arguments.question, answers: ["dim ker C = 4 - 2 = 2"], answeredAt: "2026-11-08T10:00:00Z" });
const refusedSend: ToolCall = { type: "toolCall", id: "s-refused", name: SEND_TO_USER_TOOL, arguments: {} };
const handoff: ToolCall = { type: "toolCall", id: "h-1", name: "practice", arguments: { scope: "rank, the sheet 4 kind of problems", reason: "He answered the check right." } };
const rewrite: ToolCall = { type: "toolCall", id: "s-2", name: SEND_TO_USER_TOOL, arguments: { message: "Setting one free variable to $1$ and the other to $0$ gives one kernel vector for each free variable." } };

describe("a handoff beside a refused message ends its turn on the rewrite (round 15, m14)", () => {
	const record: LhMessage[] = [
		newUserMessage("Practice rank, the sheet 4 kind of problems."),
		assistant("a-1", recall),
		answered,
		assistant("a-2", refusedSend, handoff),
		result(refusedSend, "Not shown to him: this message breaks the voice.", { withheld: "voice" }, true),
		result(handoff, "Handoff recorded.", { ok: true, mode: "practice" }),
		assistant("a-3", rewrite),
		result(rewrite, "Message received for display."),
	];

	it("owes no continuation: the handoff's wake alone starts practice", () => {
		assert.equal(needsContinuation(record), false);
	});

	it("a tool result still owes one, after an earlier turn's handoff too", () => {
		const read: ToolCall = { type: "toolCall", id: "c-1", name: "course_show", arguments: {} };
		assert.equal(needsContinuation([newUserMessage("show me"), assistant("a-1", read), result(read, "{}")]), true);
		assert.equal(needsContinuation([...record, newUserMessage("what is rank again?"), assistant("a-4", read), result(read, "{}")]), true, "his message opened a new turn");
	});
});
