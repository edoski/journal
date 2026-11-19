/**
 * Round 18, m16 (3 n2): "Review Inclusion-exclusion principle" opened on
 * Σ(−1)ʲC(k,j). He was marked Right, the answer was filed under the
 * binomial theorem, and a seven-step re-teach followed with no word. Told
 * "I got the inclusion-exclusion one right", the tutor answered "It was
 * not an inclusion-exclusion count, so your inclusion-exclusion review is
 * still open." A review's first question is on its own topic, the prompt
 * says; and an answer the review saves on another topic holds the turn's
 * end until one sentence says what the question was for.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newCourseContextMessage, newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const withheld = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};
const BRIEF = "[Course record] Probability · today 2026-11-08 (Sunday)\nOpened on: inclusion-exclusion, as its review. He pressed its button, and the app posted his first message. The session is his review, whatever it re-teaches.";

/** The review's probe, his right answer to its first question. */
function reviewTurn(review = true): { guard: VoiceGuard; question: string } {
	const recall: ToolCall = { type: "toolCall", id: `q-${++n}`, name: "recall", arguments: { question: "For a whole number $k \\ge 1$, what is $\\sum_{j=0}^{k} (-1)^j \\binom{k}{j}$, and why?", correctAnswer: "$0$, since it is $(1-1)^k$." } };
	const guard = new VoiceGuard([
		newCourseContextMessage(BRIEF, "k"),
		newUserMessage("Review Inclusion-exclusion principle"),
		assistant([recall]),
		{ role: "toolResult", toolCallId: recall.id, toolName: "recall", content: [{ type: "text", text: "0" }], details: { kind: "explain", text: "0, it is the binomial expansion of (1 - 1)^k", confidence: "confident" }, isError: false, timestamp: 1 } as unknown as LhMessage,
	], undefined, review, true);
	return { guard, question: recall.id };
}
const save = (question: string, topic: string): ToolCall => ({ type: "toolCall", id: `c-${++n}`, name: "course_save", arguments: { changes: { observations: [{ topics: [topic], question, text: "Found the alternating sum is 0 as $(1-1)^k$", response: "0", help: "none", result: "correct", sure: "confident" }] } } });
const probeDone = (): ToolCall => ({ type: "toolCall", id: `d-${++n}`, name: "probe_done", arguments: { assessment: { summary: "…" } } });

describe("a review's first answer on another topic (round 18, m16)", () => {
	it("lens 3's probe end, with the answer filed under the binomial theorem and no word, is held", () => {
		const { guard, question } = reviewTurn();
		assert.equal(withheld(guard, save(question, "binomial-theorem")), null);
		assert.equal(withheld(guard, probeDone()), "off-topic");
	});

	it("one sentence of what it was for lets the probe end", () => {
		const { guard, question } = reviewTurn();
		withheld(guard, save(question, "binomial-theorem"));
		assert.equal(withheld(guard, send("That identity is what the three-set count rests on; now the count itself.")), null);
		assert.equal(withheld(guard, probeDone()), null);
	});

	it("an answer on the review's own topic needs no word", () => {
		const { guard, question } = reviewTurn();
		withheld(guard, save(question, "inclusion-exclusion"));
		assert.equal(withheld(guard, probeDone()), null);
	});

	it("a lesson's answer on a need is the lesson's own business", () => {
		const { guard, question } = reviewTurn(false);
		withheld(guard, save(question, "binomial-theorem"));
		assert.equal(withheld(guard, probeDone()), null);
	});

	it("the prompt puts a review's first question on its own topic", () => {
		assert.match(courseRecordPrompt("prober", { arcs: true }), /its first question is on that topic itself, from its review prompt/);
	});
});
