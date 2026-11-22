/**
 * Round 19, M2 (1 N1): an Eigen lesson's turn marked his wrong prediction,
 * resolved it, and stopped, with nothing for him to answer; the lesson then
 * left Home, the sidebar and its topic page. A lesson turn that graded his
 * answer with plan steps left (or a review answer not right) is told once,
 * by Claude Code's Stop hook (`beforeEnd`), to go on with the next step and
 * its question.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { answered, assistant, doneTonight, explain, nextId, progress, recall, save, send, verdict } from "./helpers/round19-turns.ts";

const PLAN = "graph TD\n  maps[What a matrix does to a vector] --> lines[Lines a matrix maps into themselves]\n  lines --> equation[The equation an eigenvector satisfies]";

/** The Eigen lesson, its plan written, at the prediction he has just answered. */
function eigenAt(opts: { review?: boolean; answer?: string } = {}): { guard: VoiceGuard; question: ToolCall } {
	const prediction = explain("What do you expect $A = \\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix}$ does to the axes?", "predict", "lines");
	const planId = `plan-${nextId()}`;
	const history: LhMessage[] = [
		newUserMessage("Eigenvalues and eigenvectors"),
		assistant([{ type: "toolCall", id: planId, name: "plan_init", arguments: { mermaid: PLAN } }]),
		{ role: "toolResult", toolCallId: planId, toolName: "plan_init", content: [{ type: "text", text: "{}" }], details: {}, isError: false, timestamp: 1 } as unknown as LhMessage,
		assistant([progress(["maps"]), send("A matrix sends each vector somewhere new."), prediction]),
		answered(prediction, opts.answer ?? "The two axes, x and y, each stretched by 2, since the diagonal is 2 and 2", { confidence: "guessing" }),
	];
	return { guard: new VoiceGuard(history, undefined, opts.review === true, true), question: prediction };
}

describe("M2: a lesson turn that marks his answer goes on to the next step (1 N1)", () => {
	it("lens 1's turn: the mark, its resolution, then a stop, is told to pose the next step, once", () => {
		const { guard, question } = eigenAt();
		assert.equal(verdict(guard, save(question.id, "incorrect", ["eigen"], { predicted: true, sure: "guess" })), null);
		assert.equal(verdict(guard, send("The x-axis moves off itself, since $A(1,0) = (2,1)$.")), null);
		assert.match(guard.beforeEnd() ?? "", /the next step's question with your question tool/);
		assert.equal(guard.beforeEnd(), undefined, "told once a turn");
	});

	it("the turn that poses the next question ends as it is", () => {
		const { guard, question } = eigenAt();
		verdict(guard, save(question.id, "incorrect"));
		verdict(guard, send("The x-axis moves off itself, since $A(1,0) = (2,1)$."));
		assert.equal(verdict(guard, explain("Which line through the origin does $A$ map into itself, and why?")), null);
		assert.equal(guard.beforeEnd(), undefined);
	});

	it("with every step done this turn, or on his Done for today, nothing is owed", () => {
		const { guard, question } = eigenAt();
		verdict(guard, save(question.id, "correct"));
		verdict(guard, progress(["lines", "equation"]));
		verdict(guard, send("That is the whole map."));
		assert.equal(guard.beforeEnd(), undefined);

		const ask = explain("Which vectors does $A$ only stretch?");
		const closing = new VoiceGuard([newUserMessage("Eigenvalues and eigenvectors"), assistant([{ type: "toolCall", id: "plan-x", name: "plan_init", arguments: { mermaid: PLAN } }]), assistant([ask]), answered(ask, "the diagonal"), doneTonight()], undefined, false, true);
		verdict(closing, send("Your Eigenvalues and eigenvectors lesson continues tomorrow, Monday 9 November."));
		assert.equal(closing.beforeEnd(), undefined);
	});

	it("a review answer that was not right owes the review's next question; a right one may end it", () => {
		const ask = recall("What is $P(A \\mid B)$ when $A \\subseteq B$?");
		const history = [newUserMessage("Review Conditional probability"), assistant([ask]), answered(ask, "P(A)")];
		const missed = new VoiceGuard(history, undefined, true, true);
		verdict(missed, save(ask.id, "incorrect", ["conditional-probability"]));
		verdict(missed, send("Conditioning on $B$ divides by $P(B)$, so it is $P(A)/P(B)$."));
		assert.match(missed.beforeEnd() ?? "", /A review asks its next question/);
		const right = new VoiceGuard(history, undefined, true, true);
		verdict(right, save(ask.id, "correct", ["conditional-probability"]));
		verdict(right, send("Your Conditional probability review comes back on Tuesday 17 November."));
		assert.equal(right.beforeEnd(), undefined);
	});
});
