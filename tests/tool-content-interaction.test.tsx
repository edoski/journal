import React, { act } from "react";
(globalThis as { React?: typeof React }).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { QuestionDock } from "../components/question-dock.tsx";
import { AnsweredCard } from "../components/answered-card.tsx";
import { emptyDockSelection, newAnswerResult, type QuestionAnswerData } from "../src/core/index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

const submitForm = async (host: HTMLElement) => {
	const submit = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Submit answer"))!;
	assert.equal(submit.disabled, false);
	// linkedom does not implement the browser's default button→form
	// action; dispatch its native submit event through React instead.
	await act(async () => submit.closest("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
};

test("actual select → submit → saved result → historical card uses source data and presentation-only recovery", async () => {
	const question = String.raw`Find $\\nabla f$ for $\begin{pmatrix}a&b\\c&d\end{pmatrix}$.`;
	const label = String.raw`$\\nabla f$`;
	const input = { question, options: [{ label }, { label: "no" }] };
	const before = structuredClone(input);
	let answer: QuestionAnswerData | undefined;
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<QuestionDock toolName="ask_user_question" toolCallId="interactive_source" input={input} expanded
			onExpand={() => {}} onSubmit={a => { answer = a; }} />));
		assert.equal(host.querySelectorAll("mtr").length, 2, "the live matrix retains two rows");
		const choice = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(button => button.querySelector(".katex"))!;
		assert.ok(choice);
		await act(async () => choice.click());
		assert.equal(choice.getAttribute("aria-checked"), "true");
		await submitForm(host);
		assert.ok(answer);
		assert.equal(answer.questionText, question);
		assert.equal(answer.answers[0]!.value, label, "display recovery must not alter the submitted identity");
		assert.equal(answer.answers[0]!.label, label);
		assert.equal(answer.confidence, undefined, "ask answers carry no confidence");
		const persisted = JSON.parse(JSON.stringify(newAnswerResult("interactive_source", "ask_user_question", answer)));
		assert.deepEqual(persisted.details, JSON.parse(JSON.stringify(answer)));
		const saved = structuredClone(persisted.details);
		await act(async () => root.render(<AnsweredCard answer={persisted.details} input={input} />));
		assert.equal(host.querySelectorAll("mtr").length, 2, "the question retains its rows");
		const annotations = [...host.querySelectorAll('annotation[encoding="application/x-tex"]')].map(n => n.textContent);
		assert.equal(annotations.filter(t => t === String.raw`\nabla f`).length, 2);
		assert.deepEqual(persisted.details, saved);
		assert.deepEqual(input, before);
	} finally { await act(async () => root.unmount()); host.remove(); }
});

test("one tap on a confidence state rides the free-response answer; neutral is the untouched default", async () => {
	const input = { type: "check", nodeId: "n", question: "Why?", correctAnswer: "Because." };
	const draft = { selection: emptyDockSelection(), thinking: "", other: "", text: "My reasoning.", confidence: "neutral" as const };
	const answers: QuestionAnswerData[] = [];
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<QuestionDock toolName="explain" toolCallId="conf_a" input={input} expanded initialDraft={draft}
			onExpand={() => {}} onSubmit={a => { answers.push(a); }} />));
		await submitForm(host);
		assert.equal(answers[0]?.confidence, "neutral");
		const guessing = host.querySelector<HTMLButtonElement>('[data-testid="confidence-choice"] [data-state="guessing"]')!;
		await act(async () => guessing.click());
		assert.equal(guessing.getAttribute("aria-checked"), "true");
		assert.equal(host.querySelector('[data-state="neutral"]')!.getAttribute("aria-checked"), "false");
		await submitForm(host);
		assert.equal(answers[1]?.confidence, "guessing");
	} finally { await act(async () => root.unmount()); host.remove(); }
});

test("committed-answer reveals keep the first paragraph inline without flattening later paragraphs", async () => {
	const committed = String.raw`First paragraph.\n\nSecond paragraph with $\\nabla f$ and $\nu$.`;
	const answer: QuestionAnswerData = { kind: "explain", questionText: "Explain the gradient.", answers: [], text: "Synthetic answer", committed, answeredAt: "2026-10-26T00:00:00.000Z" };
	const input = { question: answer.questionText, correctAnswer: committed };
	const before = structuredClone(answer);
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<AnsweredCard answer={answer} input={input} />));
		const paragraphs = host.querySelectorAll("p");
		assert.equal(paragraphs.length, 3, "question plus two committed-answer paragraphs");
		assert.ok(paragraphs[1]!.parentElement!.classList.contains("[&>p:first-child]:inline"));
		assert.ok(!paragraphs[1]!.parentElement!.classList.contains("[&_p]:inline"));
		assert.equal(host.querySelectorAll(".katex-error").length, 0);
		assert.deepEqual(answer, before);
	} finally { await act(async () => root.unmount()); host.remove(); }
});
