/**
 * Round 17, m16 (3 m1): at "What is A⁻¹?" for the quarter turn he answered
 * "A⁻¹ = A", then "(0 1; 1 0)". The repair gave a break, a rule and a
 * twin on the shear, and never wrote the right A⁻¹ = (0 1; −1 0). After a
 * second miss, the repair now ends on the check's right answer: the
 * teaching prompt says so, and the guard holds back the next question
 * once while nothing sent this turn writes the right answer's maths.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";

// The lens's check and right answer, as the record holds them.
const QUESTION = "The matrix $A$ rotates the plane a quarter turn anticlockwise:\n$$A = \\begin{pmatrix} 0 & -1 \\\\ 1 & 0 \\end{pmatrix}.$$\nWhat is $A^{-1}$, and why?";
const CORRECT = "$A^{-1}$ is the quarter turn clockwise, since turning back a quarter turn returns every vector to where it started. Its columns are the images of $e_1$ and $e_2$ under the clockwise turn: $e_1 \\mapsto (0,-1)^{\\mathsf T}$ and $e_2 \\mapsto (1,0)^{\\mathsf T}$, so\n$$A^{-1} = \\begin{pmatrix} 0 & 1 \\\\ -1 & 0 \\end{pmatrix}.$$\nCheck: $A^{-1}A = I$ and $AA^{-1} = I$.";
const BREAK = "The clockwise quarter turn is the right map, but the matrix you wrote swaps the two axes, which is the reflection across the line $y = x$. Its first column sends $e_1$ up to $(0,1)^{\\mathsf T}$, while a clockwise turn sends $e_1$ down to $(0,-1)^{\\mathsf T}$.";
const RULE = "The columns of a matrix are where its map sends $e_1$ and $e_2$, so an inverse is built column by column from the undoing map.";
const TWIN = "The matrix $B$ is a shear that fixes $e_1$ and pushes $e_2$ one unit to the right:\n$$B = \\begin{pmatrix} 1 & 1 \\\\ 0 & 1 \\end{pmatrix}.$$\nWhat is $B^{-1}$, and why?";

let n = 0;
const explain = (question: string, correctAnswer = CORRECT, type = "check"): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "explain", arguments: { question, type, nodeId: "undo-map", correctAnswer } });
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const save = (question: string, result: string): ToolCall => ({ type: "toolCall", id: `v-${++n}`, name: "course_save", arguments: { changes: { observations: [{ question, topics: ["invertibility"], text: "Wrote a reflection for the clockwise turn", response: "(0 1; 1 0)", help: "none", result }] } } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const answered = (call: ToolCall, text: string): LhMessage => ({ id: `r-${++n}`, role: "toolResult", toolCallId: call.id, toolName: "explain", content: [{ type: "text", text }], details: { kind: "explain", text, answeredAt: "2026-11-18T19:40:00Z" }, isError: false, timestamp: 1 }) as LhMessage;
const verdict = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

/** The lesson with his second try at the A⁻¹ check opening the turn (or his first, with `first`). */
function secondTry(first = false): { guard: VoiceGuard; answer: string } {
	const history: LhMessage[] = [newUserMessage("Invertible matrices")];
	if (!first) {
		const one = explain(QUESTION);
		history.push(assistant([one]), answered(one, "A^-1 = A"), assistant([send("Doing $A$ twice turns the plane a half turn, so $AA$ is not $I$. Follow $e_1$ back.")]));
	}
	const two = explain(QUESTION);
	history.push(assistant([two]), answered(two, "A^-1 is the quarter turn clockwise, so A^-1 = (0 1; 1 0)"));
	return { guard: new VoiceGuard(history, undefined, false, true), answer: two.id };
}

describe("after a second miss, the repair writes the right answer (round 17, m16)", () => {
	it("the lens's break, rule and twin, with no A⁻¹ written, has its twin held back once", () => {
		const { guard, answer } = secondTry();
		assert.equal(verdict(guard, save(answer, "partial")), null);
		assert.equal(verdict(guard, send(BREAK)), null);
		assert.equal(verdict(guard, send(RULE)), null);
		assert.equal(verdict(guard, explain(TWIN, "$B^{-1} = \\begin{pmatrix} 1 & -1 \\\\ 0 & 1 \\end{pmatrix}$")), "repaired");
		assert.equal(verdict(guard, explain(TWIN, "$B^{-1} = \\begin{pmatrix} 1 & -1 \\\\ 0 & 1 \\end{pmatrix}$")), null, "once a turn, never a loop");
	});

	it("a repair that ends on the right A⁻¹, in any bracket and spacing, lets the twin through", () => {
		const { guard, answer } = secondTry();
		verdict(guard, save(answer, "partial"));
		verdict(guard, send(BREAK));
		assert.equal(verdict(guard, send("Undoing the quarter turn gives\n\n$$A^{-1} = \\left[\\begin{bmatrix}0&1\\\\-1&0\\end{bmatrix}\\right].$$")), null);
		assert.equal(verdict(guard, explain(TWIN)), null);
	});

	it("the question's own matrix shown again is not the answer", () => {
		const { guard, answer } = secondTry();
		verdict(guard, save(answer, "incorrect"));
		verdict(guard, send("Here $$A = \\begin{pmatrix} 0 & -1 \\\\ 1 & 0 \\end{pmatrix}$$ turns $e_1$ up."));
		assert.equal(verdict(guard, explain(TWIN)), "repaired");
	});

	it("a turn that ends with no question is told to write the right answer", () => {
		const { guard, answer } = secondTry();
		verdict(guard, save(answer, "incorrect"));
		verdict(guard, send(BREAK));
		assert.match(guard.beforeEnd() ?? "", /right answer/);
	});

	it("a first try, and a second try saved right, hold nothing here", () => {
		const first = secondTry(true);
		verdict(first.guard, save(first.answer, "correct"));
		assert.equal(verdict(first.guard, explain(TWIN)), null);
		const right = secondTry();
		verdict(right.guard, save(right.answer, "correct"));
		assert.equal(verdict(right.guard, explain(TWIN)), null);
	});

	it("the teacher's retry rule says the repair ends on the right answer", () => {
		assert.match(composeInstructions("teacher"), /Two failures at the same step mean stop asking\.\*\* The repair ends on the check's right answer, written out in its maths/);
	});
});
