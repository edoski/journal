import React, { act, type MutableRefObject } from "react";
(globalThis as { React?: typeof React }).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { ProseAnswerProvider, useProseAnswer, type ProseAnswer } from "../components/lesson/prose/prose-answer.tsx";
import { proseAnswer, proseQuestionSpec } from "../components/lesson/prose/prose-question-data.ts";
import { emptyDockSelection, newAnswerResult, type QuestionAnswerData } from "../src/core/index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
	// The disclosure's collapsible measures itself as it opens.
	getComputedStyle: () => ({ getPropertyValue: () => "" }),
	requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout });

/** The open question with the lesson's own pick state, read through `state`. */
function OpenQuestion({ input, state }: { input: unknown; state: MutableRefObject<ProseAnswer | null> }) {
	const answer = useProseAnswer({ openKey: "interactive_source", box: null });
	state.current = answer;
	return <ProseAnswerProvider value={answer}><ProseQuestion tool="ask_user_question" toolCallId="interactive_source" input={input} open /></ProseAnswerProvider>;
}

test("actual select → answer → saved result → historical question uses source data and presentation-only recovery", async () => {
	const question = String.raw`Find $\\nabla f$ for $\begin{pmatrix}a&b\\c&d\end{pmatrix}$.`;
	const label = String.raw`$\\nabla f$`;
	const input = { question, options: [{ label }, { label: "no" }] };
	const before = structuredClone(input);
	const state: MutableRefObject<ProseAnswer | null> = { current: null };
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<OpenQuestion input={input} state={state} />));
		assert.equal(host.querySelectorAll("mtr").length, 2, "the live matrix retains two rows");
		const choice = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(button => button.querySelector(".katex"))!;
		assert.ok(choice);
		await act(async () => choice.click());
		assert.equal(choice.getAttribute("aria-checked"), "true");
		const spec = proseQuestionSpec("ask_user_question", "interactive_source", input)!;
		const answer = proseAnswer(spec, state.current!.selection, "", state.current!.confidence);
		assert.equal(answer.questionText, question);
		assert.equal(answer.answers[0]!.value, label, "display recovery must not alter the submitted identity");
		assert.equal(answer.answers[0]!.label, label);
		assert.equal(answer.confidence, undefined, "ask answers carry no confidence");
		const persisted = JSON.parse(JSON.stringify(newAnswerResult("interactive_source", "ask_user_question", answer)));
		assert.deepEqual(persisted.details, JSON.parse(JSON.stringify(answer)));
		const saved = structuredClone(persisted.details);
		await act(async () => root.render(<ProseQuestion tool="ask_user_question" toolCallId="interactive_source" input={input} output={persisted.details} open={false} />));
		assert.equal(host.querySelectorAll("mtr").length, 2, "the question retains its rows");
		const annotations = [...host.querySelectorAll('annotation[encoding="application/x-tex"]')].map(n => n.textContent);
		assert.ok(annotations.filter(t => t === String.raw`\nabla f`).length >= 2, "the question and its choice recover");
		assert.deepEqual(persisted.details, saved);
		assert.deepEqual(input, before);
	} finally { await act(async () => root.unmount()); host.remove(); }
});

test("the confidence he picks rides the free-response answer; neutral is the untouched default", () => {
	const spec = proseQuestionSpec("explain", "conf_a", { type: "check", nodeId: "n", question: "Why?", correctAnswer: "Because." })!;
	assert.equal(proseAnswer(spec, emptyDockSelection(), "My reasoning.", "neutral").confidence, "neutral");
	assert.equal(proseAnswer(spec, emptyDockSelection(), "My reasoning.", "guessing").confidence, "guessing");
});

test("the committed-answer reveal keeps its paragraphs apart", async () => {
	const committed = String.raw`First paragraph.\n\nSecond paragraph with $\\nabla f$ and $\nu$.`;
	const answer: QuestionAnswerData = { kind: "explain", questionText: "Explain the gradient.", answers: [], text: "Synthetic answer", committed, answeredAt: "2026-10-26T00:00:00.000Z" };
	const input = { question: answer.questionText, correctAnswer: committed };
	const before = structuredClone(answer);
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<ProseQuestion tool="explain" toolCallId="reveal" input={input} output={answer} open={false} />));
		const heading = host.querySelector<HTMLButtonElement>('[data-testid="prose-disclosure"]')!;
		assert.match(heading.textContent!, /The answer/, "the reveal is labelled");
		await act(async () => heading.click());
		const paragraphs = [...heading.closest('[data-slot="prose-disclosure"]')!.querySelectorAll("p")].map(p => p.textContent);
		assert.equal(paragraphs.length, 2, "both committed-answer paragraphs stay paragraphs");
		assert.equal(paragraphs[0], "First paragraph.");
		assert.match(paragraphs[1]!, /^Second paragraph with/);
		assert.equal(host.querySelectorAll(".katex-error").length, 0);
		assert.deepEqual(answer, before);
	} finally { await act(async () => root.unmount()); host.remove(); }
});
