/**
 * Round 19, m16 (3 n2, n3): after an Ask the open question came back drawn
 * in full, and an Ask between practice problems got an unasked problem. The
 * open question is asked again with its own tool and step; a practice Ask
 * poses no problem he did not ask for.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { ASKED_INSTEAD_TEXT } from "../src/core/question-core.ts";
import { answered, assistant, explain, nextId, recall, send, verdict } from "./helpers/round19-turns.ts";

describe("m16: one rule for an Ask reply (3 n2, n3)", () => {
	/** A review whose question he set aside to ask something. */
	function setAside(): { guard: VoiceGuard; question: ToolCall } {
		const question = recall("What is the derivative of $\\cos^2(x^3)$, and why?");
		const guard = new VoiceGuard([
			newUserMessage("Review Calculus I"),
			assistant([question]),
			answered(question, "Dismissed.", { dismissed: true, reason: "asked" }),
			{ ...newUserMessage("can we start a new topic instead?"), id: `u-${nextId()}` } as LhMessage,
		], undefined, true, true);
		return { guard, question };
	}

	it("the open question is asked again with its own tool, so it draws as his turn on the question above", () => {
		const { guard } = setAside();
		verdict(guard, send("A new topic waits until this review is done."));
		assert.equal(verdict(guard, explain("What is the derivative of $\\cos^2(x^3)$, and why?", "check", "chain"))?.withheld, "set-aside");
		assert.equal(verdict(guard, recall("What is the derivative of $\\cos^2(x^3)$, and why?")), null);
	});

	it("the Ask's instructions say the same tool on the same step", () => {
		assert.match(ASKED_INSTEAD_TEXT, /a fresh call of the same tool on the same step/);
	});

	/** Rank practice, its problem concluded, then his message from Ask. */
	function practiceAsk(words: string): VoiceGuard {
		const problem: ToolCall = { type: "toolCall", id: `pr-${nextId()}`, name: "problem", arguments: { statement: "Find the rank of $M$.", topics: ["rank"] } };
		const conclude: ToolCall = { type: "toolCall", id: `cc-${nextId()}`, name: "conclude", arguments: { result: "correct" } };
		return new VoiceGuard([
			newUserMessage("Rank"),
			assistant([problem]),
			{ id: `t-${nextId()}`, role: "custom", customType: "practice-thinking", content: "rank 2", display: true, details: { problemCallId: problem.id }, timestamp: 1 } as LhMessage,
			assistant([conclude]),
			{ role: "toolResult", toolCallId: conclude.id, toolName: "conclude", content: [{ type: "text", text: "Problem concluded." }], details: {}, isError: false, timestamp: 1 } as unknown as LhMessage,
			{ ...newUserMessage(words), id: `u-${nextId()}` } as LhMessage,
		], (name) => name === "problem", false, true);
	}
	const nextProblem = (): ToolCall => ({ type: "toolCall", id: `pr-${nextId()}`, name: "problem", arguments: { statement: "Do $(1,0,1)$, $(0,1,1)$ and $(1,1,0)$ form a basis of $\\mathbb{R}^3$?", topics: ["basis"] } });

	it("lens 3's side question after a finished problem gets no unasked problem", () => {
		const guard = practiceAsk("why does the rank equal the number of pivot columns?");
		verdict(guard, send("Each pivot column is independent of the ones before it."));
		assert.equal(verdict(guard, nextProblem())?.withheld, "asked-only");
	});

	for (const words of ["another one please", "give me a problem on bases", "can I try one on eigenvalues?"]) {
		it(`his words asking for one pose it: "${words}"`, () => {
			assert.equal(verdict(practiceAsk(words), nextProblem()), null);
		});
	}

	it("a request the words miss is posed on the second try, as the refusal says", () => {
		const guard = practiceAsk("let's do kernels now");
		assert.equal(verdict(guard, nextProblem())?.withheld, "asked-only");
		assert.equal(verdict(guard, nextProblem()), null);
	});
});
