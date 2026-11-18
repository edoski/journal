/**
 * Round 17, M7 (3 N1), the Ask guard's half: in the Invertible lesson, at
 * the R and S check ("Is SR the 3 × 3 identity, and why?"), he switched to
 * Ask and sent "why does RS = I not force SR = I here…". The tutor answered,
 * then posed a new check on the same step ("Three 3 × 3 matrices satisfy
 * UVW = I. Is U invertible, and why?"). The screen took it for a re-ask and
 * drew only "Your turn, on the question above" over the SR question, so his
 * SR answer was filed under the hidden UVW one. The rule is to ask the open
 * question again, word for word: the guard now holds back any other graded
 * question once in a turn that answers an Ask.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newAskedMessage, newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";

const SR = "With\n$$R = \\begin{pmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 0 \\end{pmatrix} \\quad\\text{and}\\quad S = \\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\\\ 0 & 0 \\end{pmatrix},$$\nthe product $RS$ is the $2 \\times 2$ identity. Is $SR$ the $3 \\times 3$ identity, and why?";
const UVW = "Three $3 \\times 3$ matrices satisfy $UVW = I$. Is $U$ invertible, and why?";
let n = 0;
const explain = (question: string, type = "check", tool = "explain"): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: tool, arguments: { question, type, nodeId: "two-sided", correctAnswer: "No: SR has rank at most 2." } });
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const saveHisMessage = (): ToolCall => ({
	type: "toolCall",
	id: `v-${++n}`,
	name: "course_save",
	arguments: { changes: { observations: [{ question: "his-message", topics: ["invertibility"], text: "Said SR is not I", response: "no", help: "none", result: "correct" }] } },
});
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const setAside = (call: ToolCall): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text: "set aside" }], details: { kind: call.name, questionText: (call.arguments as { question: string }).question, answers: [], dismissed: true, reason: "asked", answeredAt: "2026-11-18T19:49:00Z" }, isError: false, timestamp: 1 }) as LhMessage;
const verdict = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

/** The lesson at the SR check, which he set aside to send `words` from Ask. */
function askedAt(words: string, tool = "explain"): VoiceGuard {
	const check = explain(SR, "check", tool);
	const history: LhMessage[] = [newUserMessage("Invertible matrices"), assistant([send("A product of non-square matrices can be the identity one way round only."), check]), setAside(check), newAskedMessage("question"), newUserMessage(words)];
	return new VoiceGuard(history, undefined, false, true);
}

const ANSWER = "From $RS = I$, a vector with $Sv = 0$ gives $v = RSv = 0$, so $S$ is one-to-one. Turning one-to-one into onto needs the domain and codomain to have the same dimension, and here they are $\\mathbb{R}^2$ and $\\mathbb{R}^3$.";

describe("after an Ask, the open question comes back as it was (round 17, M7)", () => {
	it("the new UVW check the lens saw is held back, and the SR check asked again word for word goes through", () => {
		const guard = askedAt("why does RS = I not force SR = I here, when for square matrices it does?");
		assert.equal(verdict(guard, send(ANSWER)), null);
		const held = explain(UVW);
		assert.equal(verdict(guard, held), "set-aside");
		const refusal = (guard as unknown as { decisions: Map<string, { content: Array<{ text: string }> }> }).decisions.get(held.id)!;
		assert.match(refusal.content[0]!.text, /word for word/);
		assert.ok(refusal.content[0]!.text.includes(JSON.stringify(SR)), "the refusal quotes the open question's words");
		assert.equal(verdict(guard, explain(SR)), null);
	});

	it("the probe's question is held the same way", () => {
		const guard = askedAt("what does onto mean again?", "recall");
		assert.equal(verdict(guard, explain(UVW, "check", "recall")), "set-aside");
		assert.equal(verdict(guard, explain(SR, "check", "recall")), null);
	});

	it("the hold is once a turn, so a tutor that insists is never looped", () => {
		const guard = askedAt("why does RS = I not force SR = I here?");
		assert.equal(verdict(guard, explain(UVW)), "set-aside");
		assert.equal(verdict(guard, explain(UVW)), null);
	});

	it("his message that was his answer, saved as one, lets the next question through", () => {
		const guard = askedAt("no, its rank is at most 2");
		assert.equal(verdict(guard, saveHisMessage()), null);
		assert.equal(verdict(guard, explain(UVW)), null);
	});

	it("a guess he asked to make first is posed as a prediction, and a request to be taught sets the question aside for good", () => {
		const guess = askedAt("let me guess first");
		assert.equal(verdict(guess, explain("What do you expect $SR$ to be, and why?", "predict")), null);
		const taught = askedAt("stop quizzing me and just explain it");
		assert.equal(verdict(taught, explain(UVW)), null);
	});

	it("a turn that does not answer an Ask holds nothing", () => {
		const check = explain(SR);
		const answered = { id: `r-${++n}`, role: "toolResult", toolCallId: check.id, toolName: "explain", content: [{ type: "text", text: "No" }], details: { kind: "explain", text: "No, rank at most 2", answeredAt: "2026-11-18T19:49:00Z" }, isError: false, timestamp: 1 } as LhMessage;
		const guard = new VoiceGuard([newUserMessage("Invertible matrices"), assistant([check]), answered]);
		assert.equal(verdict(guard, explain(UVW)), null);
	});
});
