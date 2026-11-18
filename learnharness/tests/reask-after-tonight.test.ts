/**
 * Round 8 (4 #1): a half answer kept by Done for today comes back when the
 * tutor asks that question again in other words. The question set aside
 * for today is asked again by the next question of the same kind (the same
 * tool, the same form, the same plan step when both name one), whatever
 * its words; an unrelated question of another kind never takes it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reaskedFrom } from "../components/lesson/prose/prose-question-data.ts";

type Part = { type: string; toolCallId: string; input?: unknown; output?: unknown };
const explain = (id: string, question: string, output?: unknown, nodeId = "binomial"): Part => ({ type: "tool-explain", toolCallId: id, input: { type: "check", nodeId, question, correctAnswer: "x" }, ...(output ? { output } : {}) });
const ask = (id: string, question: string, options?: { label: string }[], output?: unknown): Part => ({ type: "tool-ask_user_question", toolCallId: id, input: { question, ...(options ? { options } : {}) }, ...(output ? { output } : {}) });
const tonight = { kind: "explain", questionText: "q", answers: [], dismissed: true, reason: "tonight", answeredAt: "2026-11-15T10:00:00Z" };
const answered = { kind: "ask", questionText: "q", answers: [{ label: "Yes", value: "yes", index: 1 }], answeredAt: "2026-11-15T10:05:00Z" };
const view = (...parts: Part[][]) => parts.map((p) => ({ parts: p }));

describe("reaskedFrom after Done for today", () => {
	it("the next check of the same kind asks the question left for today again, in other words", () => {
		const messages = view(
			[explain("c1", "You guess every answer at random, independently. Write P(X ≥ 2).", tonight)],
			[{ type: "text", toolCallId: "" }],
			[explain("c2", "Suppose you guess every answer independently at random. Write an expression for P(X ≥ 2).")],
		);
		assert.equal(reaskedFrom(messages, "c2"), "c1");
	});

	it("a Yes/No question in between neither takes it nor stops the re-ask after it", () => {
		const messages = view(
			[explain("c1", "Write P(X ≥ 2).", tonight)],
			[ask("a1", "Ready to pick up where we stopped?", [{ label: "Yes" }, { label: "No" }], answered)],
			[explain("c2", "Write an expression for P(X ≥ 2).")],
		);
		assert.equal(reaskedFrom(messages, "a1"), null);
		assert.equal(reaskedFrom(messages, "c2"), "c1");
	});

	it("a check on another plan step is not the same question", () => {
		const messages = view([explain("c1", "Write P(X ≥ 2).", tonight)], [explain("c2", "What is the mean of a Poisson variable?", undefined, "poisson")]);
		assert.equal(reaskedFrom(messages, "c2"), null);
	});

	it("only the first check after it asks it again", () => {
		const messages = view(
			[explain("c1", "Write P(X ≥ 2).", tonight)],
			[explain("c2", "Write an expression for P(X ≥ 2).", { kind: "explain", questionText: "q", answers: [], text: "1 − …", answeredAt: "2026-11-15T10:06:00Z" })],
			[explain("c3", "Now the variance?")],
		);
		assert.equal(reaskedFrom(messages, "c3"), null);
	});
});

describe("the left question is drawn once when it is asked again (round 14 integration, M1)", () => {
	it("a question set aside for today and asked again further down keeps only Left for next time", async () => {
		const { leftAskedBelow } = await import("../components/lesson/prose/prose-question-data.ts");
		const messages = view(
			[explain("c1", "Which inputs does $A$ send to zero?", tonight)],
			[{ type: "text", toolCallId: "" }],
			[explain("c2", "Which inputs does $A$ send to zero?")],
		);
		assert.deepEqual([...leftAskedBelow(messages)], ["c1"]);
		assert.deepEqual([...leftAskedBelow(view([explain("c1", "Write P(X ≥ 2).", tonight)]))], [], "never asked again: its words stay");
		assert.deepEqual([...leftAskedBelow(view([explain("c1", "Write P(X ≥ 2).", tonight)], [explain("c2", "What is the mean?", undefined, "poisson")]))], [], "another step's question is a new one");
	});

	it("the set-aside card draws its words only when it is not asked again below", async () => {
		const React = await import("react");
		(globalThis as Record<string, unknown>).React = React;
		const { renderToStaticMarkup } = await import("react-dom/server");
		const { ProseQuestion } = await import("../components/lesson/prose/prose-question.tsx");
		const card = (askedBelow: boolean) =>
			renderToStaticMarkup(React.createElement(ProseQuestion, { tool: "explain", toolCallId: "c1", input: { type: "check", nodeId: "n", question: "Which inputs does A send to zero?", correctAnswer: "x" }, output: tonight as never, open: false, askedBelow }));
		assert.match(card(false), /Which inputs does A send to zero\?/);
		assert.doesNotMatch(card(true), /Which inputs/);
		assert.doesNotMatch(card(true) + card(false), /Left for next time/, "nothing typed, nothing kept: no bare label (round 16, m16)");
	});
});
