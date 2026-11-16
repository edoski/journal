/**
 * Round 12, 2 M1: in the Eigen lesson he sent from Ask "can every 2x2
 * matrix be written in a basis of its eigenvectors like B? let me guess
 * first". The tutor replied "Go ahead, guess." and posed the guess as a
 * `check`, so his guess was graded "Not right · On your own · Confident",
 * counted, and became Eigen's open mistake on five surfaces. A guess he
 * asks to make, or one the tutor invites, is a prediction: posed with
 * `type: predict`, so it is kept and never counts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { ASKED_INSTEAD_TEXT } from "../src/core/question-core.ts";
import { newAskedMessage, newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const explain = (question: string, type: "check" | "predict"): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "explain", arguments: { question, type, nodeId: "diagonal", correctAnswer: "No." } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const setAside = (callId: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text: "{}" }], details: { kind: "explain", dismissed: true, reason: "asked" }, isError: false, timestamp: 1 }) as LhMessage;
const answered = (callId: string, text: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text }], details: { kind: "explain", text, answeredAt: "2026-11-08T21:00:00Z" }, isError: false, timestamp: 1 }) as LhMessage;

const withheld = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

/** The recorded lesson up to his Ask: the coordinates question open, then
 *  his side question asking to guess first. */
function askedToGuess(words: string): LhMessage[] {
	const open = explain("Written in the basis $(1,1)$, $(1,-2)$, what are the coordinates of $Bv$, and why?", "check");
	return [newUserMessage("Eigenvalues and eigenvectors"), assistant([open]), setAside(open.id), newAskedMessage("question") as LhMessage, newUserMessage(words)];
}

const GUESS_QUESTION = "Can every $2 \\times 2$ matrix be written in a basis of its own eigenvectors, and why?";

describe("a guess he asks to make is posed as a prediction", () => {
	it("the recorded turn: \"Go ahead, guess.\" and the guess posed as a check is refused", () => {
		const guard = new VoiceGuard(askedToGuess("before that: can every 2x2 matrix be written in a basis of its eigenvectors like B? let me guess first"));
		assert.equal(withheld(guard, send("Go ahead, guess.")), null);
		assert.equal(withheld(guard, explain(GUESS_QUESTION, "check")), "guess");
	});

	it("posed as a prediction, it goes through", () => {
		const guard = new VoiceGuard(askedToGuess("before that: can every 2x2 matrix be written in a basis of its eigenvectors like B? let me guess first"));
		assert.equal(withheld(guard, explain(GUESS_QUESTION, "predict")), null);
	});

	it("his other ways of asking to guess count too", () => {
		for (const words of ["can I guess before you tell me?", "I'll guess first: does it always work?", "I want to predict it before you explain"]) {
			const guard = new VoiceGuard(askedToGuess(words));
			assert.equal(withheld(guard, explain(GUESS_QUESTION, "check")), "guess", words);
		}
	});

	it("a guess the tutor invites is a prediction, whatever he asked", () => {
		const guard = new VoiceGuard(askedToGuess("can every 2x2 matrix be written in a basis of its eigenvectors?"));
		assert.equal(withheld(guard, send("Take a guess before we work it out.")), null);
		assert.equal(withheld(guard, explain(GUESS_QUESTION, "check")), "guess");
	});

	it("a plain side question and the open question asked again are untouched", () => {
		const guard = new VoiceGuard(askedToGuess("why does linearity let me split Bv?"));
		assert.equal(withheld(guard, send("Because $B$ is linear, it acts on each part of a sum separately.")), null);
		assert.equal(withheld(guard, explain("Written in the basis $(1,1)$, $(1,-2)$, what are the coordinates of $Bv$, and why?", "check")), null);
	});

	it("feedback on his last guess is no invitation: the next check goes through", () => {
		const predict = explain(GUESS_QUESTION, "predict");
		const turn = [newUserMessage("Eigenvalues and eigenvectors"), assistant([predict]), answered(predict.id, "yes, always")];
		const guard = new VoiceGuard(turn);
		assert.equal(withheld(guard, send("A rotation by $90^\\circ$ keeps no line, so your guess fails there.")), null);
		assert.equal(withheld(guard, explain("Which line through the origin is the eigenspace $E_2$ of $B$, and why?", "check")), null);
	});

	it("the tutor reads, when he asks from Ask to guess, that the guess is a prediction", () => {
		const asked = (newAskedMessage("question") as { content: string }).content;
		for (const text of [ASKED_INSTEAD_TEXT, asked]) assert.match(text, /asks to guess[^.]*prediction/i);
	});
});
