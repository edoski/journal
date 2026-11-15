/** The Prose lesson (components/lesson/prose/prose.md): the question in the
 *  tutor's message, his answer as his bubble, and the composer that answers. */

import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StickToBottom } from "use-stick-to-bottom";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { ProseConclude, ProseProblem, RequestBubble } from "../components/lesson/prose/prose-practice.tsx";
import { ProseAnswerProvider, type ProseAnswer } from "../components/lesson/prose/prose-answer.tsx";
import { ProseComposer, type ProseComposerProps } from "../components/lesson/prose/prose-composer.tsx";
import { AnswerMarksProvider } from "../components/answer-mark.tsx";
import { cheatSheetSections } from "../components/keyboard-shortcuts.tsx";
import { buildAnswer, dismissedAnswer, emptyDockSelection, type AnswerMark } from "../src/core/index.ts";
import { proseQuestionSpec } from "../components/lesson/prose/prose-question-data.ts";

const noop = () => {};
const check = { question: "Which way does $A$ stretch?", correctAnswer: "Along $(1,1)$, by 3.", type: "check" };
const choice = { question: "What next?", options: [{ label: "Practice", description: "A short run" }, { label: "Eigenvalues" }] };
const answerState = (over: Partial<ProseAnswer> = {}): ProseAnswer => ({
	openKey: "q1",
	selection: emptyDockSelection(),
	confidence: "neutral",
	mode: "answer",
	toggle: noop,
	setConfidence: noop,
	setMode: noop,
	...over,
});
const mark = { rows: [{ id: "r1", result: "correct", grade: "unaided", helped: false, sure: "confident", label: null }], disputed: false, ruling: null } as unknown as AnswerMark;
const withMarks = (node: React.ReactNode) =>
	renderToStaticMarkup(<AnswerMarksProvider value={{ marks: { c1: mark }, onDispute: noop, canDispute: true }}>{node}</AnswerMarksProvider>);

describe("the Prose question in the tutor's message", () => {
	it("ends the message under a quiet Your turn while it waits for him", () => {
		const html = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="c1" input={check} open />);
		assert.match(html, /data-slot="prose-question" data-open=""/);
		assert.match(html, /data-slot="your-turn"[^>]*>Your turn</);
		assert.doesNotMatch(html, /The answer|by 3/, "the committed answer never shows before he answers");
	});

	it("asks again after a hint or a side question with only its mark, its words already above (round 8: no mark after a direct answer)", () => {
		const open = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="c1" input={check} open repeat />);
		assert.match(open, /data-slot="your-turn"[^>]*>Your turn, on the question above</, "the open question is marked as his turn");
		assert.match(open, /data-repeat=""/);
		const choices = renderToStaticMarkup(<ProseQuestion tool="ask_user_question" toolCallId="c2" input={choice} open repeat />);
		assert.match(choices, /data-slot="your-turn"[^>]*>Your turn</, "a repeated choice still heads its rows");
		assert.doesNotMatch(open, /stretch/, "the question's words print once");
		const spec = proseQuestionSpec("explain", "c1", check)!;
		const answered = withMarks(<ProseQuestion tool="explain" toolCallId="c1" input={check} output={buildAnswer(spec.data, { text: "Along (1,1)", confidence: "confident" }, "explain")} open={false} repeat />);
		assert.doesNotMatch(answered, /stretch\?/, "answered, it still prints once");
		assert.match(answered, /Along \(1,1\)/, "his answer stays");
	});

	it("draws a choice's options as plain numbered rows, the pick filled", () => {
		const html = renderToStaticMarkup(
			<ProseAnswerProvider value={answerState({ selection: { selected: new Set([1]), otherSelected: false } })}>
				<ProseQuestion tool="ask_user_question" toolCallId="c2" input={choice} open />
			</ProseAnswerProvider>,
		);
		assert.equal(html.match(/data-slot="prose-choice"/g)?.length, 2);
		assert.match(html, /role="radio" aria-checked="false"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="radio" aria-checked="false"/);
		assert.match(html, /aria-checked="true"[^>]*data-picked="true"/);
		assert.match(html, />1</);
		assert.match(html, />2</);
	});

	it("turns his answer into his bubble with the mark under it, and never draws the committed answer (round 8: the unguarded card stated a false fact)", () => {
		const spec = proseQuestionSpec("explain", "c1", check)!;
		const output = buildAnswer(spec.data, { text: "Along (1,1)", confidence: "confident" }, "explain");
		const html = withMarks(<ProseQuestion tool="explain" toolCallId="c1" input={check} output={output} open={false} />);
		assert.doesNotMatch(html, /Your turn/);
		assert.match(html, /data-testid="prose-answer"/);
		assert.match(html, /ms-auto flex w-fit max-w-\[80%\]/);
		assert.match(html, /data-testid="mark-line"/);
		assert.doesNotMatch(html, /data-testid="prose-disclosure"|The answer|by 3/);
	});

	it("shows a hint request as his bubble with no mark and no committed answer", () => {
		const spec = proseQuestionSpec("explain", "c1", check)!;
		const html = withMarks(<ProseQuestion tool="explain" toolCallId="c1" input={check} output={buildAnswer(spec.data, { text: "it stretches", hint: true }, "explain")} open={false} />);
		assert.match(html, /Hint/);
		assert.doesNotMatch(html, /data-testid="mark-line"|The answer/);
	});

	it("leaves a question he asked about as it was: no Skipped stamp, no answer shown", () => {
		// Round 6 (practice N4, robustness minor 7): a side question stamped
		// the question "Skipped" and the tutor posted it again in full.
		const html = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="c1" input={check} output={dismissedAnswer("explain", check.question, "asked")} open={false} />);
		assert.match(html, /stretch\?/);
		assert.doesNotMatch(html, /Skipped|prose-question-left|by 3|The answer/);
	});

	it("says a question left by Done for today is left, and never shows its answer", () => {
		const html = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="c1" input={check} output={dismissedAnswer("explain", check.question, "tonight")} open={false} />);
		assert.match(html, /Left for next time/);
		assert.doesNotMatch(html, /by 3|The answer/);
	});
});

describe("the Prose problem", () => {
	it("is the tutor's words under Your turn while he works on it", () => {
		assert.match(renderToStaticMarkup(<ProseProblem input={{ statement: "Find the rank." }} active />), /Your turn/);
		assert.doesNotMatch(renderToStaticMarkup(<ProseProblem input={{ statement: "Find the rank." }} active={false} />), /Your turn/);
	});

	it("ends with the mark and the model solution, open when he asked to see it", () => {
		const shown = withMarks(<ProseConclude toolCallId="c1" input={{ outcome: "surrendered" }} output={{}} reveal="The rank is 2." />);
		assert.match(shown, /data-testid="mark-line"/);
		assert.match(shown, /data-state="open"/);
		const solved = withMarks(<ProseConclude toolCallId="c1" input={{ outcome: "solved" }} output={{}} reveal="The rank is 2." />);
		assert.match(solved, /data-state="closed"/);
		assert.match(renderToStaticMarkup(<ProseConclude toolCallId="c1" input={{ outcome: "dismissed" }} output={{ reason: "tonight" }} reveal="" />), /Left for next time/);
	});

	it("shows what he asked for as his bubble", () => {
		const html = renderToStaticMarkup(<RequestBubble data={{ problemCallId: "p", request: "show", text: "rank 2?" } as never} />);
		assert.match(html, /Show me/);
		assert.match(html, /rank 2\?/);
	});
});

describe("the Prose composer", () => {
	const props = (over: Partial<ProseComposerProps>): ProseComposerProps => ({
		open: null,
		answer: answerState(),
		message: { busy: false, value: "", revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true },
		messageText: { read: () => "", write: noop },
		onAskInstead: noop,
		toggleRef: { current: null },
		busy: false,
		chatId: "chat",
		onSaveDraft: noop,
		onSubmitAnswer: noop,
		onSubmitThinking: async () => true,
		onRequest: noop,
		onDraftChange: noop,
		...over,
	});
	const draw = (over: Partial<ProseComposerProps>) => renderToStaticMarkup(<StickToBottom><ProseComposer {...props(over)} /></StickToBottom>);
	const question = { kind: "question" as const, key: "q1", tool: "explain", toolCallId: "c1", input: { ...check, type: "predict" } };

	it("is the lesson's composer with nothing open", () => {
		const html = draw({});
		assert.match(html, /data-mode="message"/);
		assert.doesNotMatch(html, /data-testid="prose-mode"/);
	});

	it("answers an open question: its placeholder, Hint as an icon beside attach, confidence and the Answer or Ask toggle as icons", () => {
		const html = draw({ open: question });
		assert.match(html, /data-mode="answer"/);
		assert.match(html, /placeholder="Your prediction, and why"/);
		assert.match(html, /data-slot="composer-leading"[^>]*>.*data-testid="question-hint"[^>]*aria-label="Hint"/);
		assert.match(html, /data-testid="confidence-choice"[^>]*aria-label="How sure you are: Neutral"/);
		assert.match(html, /data-testid="prose-mode"[^>]*data-mode="answer"/);
		assert.match(html, /data-testid="prose-answer-mode"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-testid="prose-answer-mode"/);
		assert.doesNotMatch(html, />(Hint|Neutral|Ask instead)</, "no text chips");
	});

	it("works a problem with Hint, Show me, Explain instead and confidence", () => {
		const html = draw({ open: { kind: "problem", toolCallId: "p1", statement: "Find the rank." }, answer: answerState({ openKey: "p1" }) });
		for (const id of ["practice-request-hint", "practice-request-show", "practice-request-explain", "confidence-choice", "prose-ask"]) assert.match(html, new RegExp(`data-testid="${id}"`));
		assert.match(html, /placeholder="Work here, think out loud."/);
	});

	it("asks instead: a message to the tutor, saying what sending does, with the way back", () => {
		const html = draw({ open: question, answer: answerState({ mode: "ask" }) });
		assert.match(html, /data-mode="message"/);
		assert.match(html, /placeholder="Ask anything. The question stays open."/);
		assert.doesNotMatch(html, /skips/, "asking never skips the question");
		assert.match(html, /data-testid="prose-mode"[^>]*data-mode="ask"/, "the same toggle, now on asking, is the way back");
	});
});

describe("the cheat sheet in the Prose lesson", () => {
	it("lists the digits and Esc", () => {
		const ids = cheatSheetSections().flatMap((s) => s.actions.map((a) => a.id));
		assert.ok(ids.includes("question-pick-digit"));
		assert.ok(ids.includes("question-ask-instead"));
	});
});
