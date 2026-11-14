/** Candidate B's answer line and its records (lesson/slot/answer-slot.md). */

import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { StickToBottom } from "use-stick-to-bottom";
import { AnswerSlot, ProblemSlot } from "../components/lesson/slot/answer-slot.tsx";
import { SlotAnswered, SlotBubble, SlotConclude, SlotQuestion } from "../components/lesson/slot/slot-records.tsx";
import { slotFocusHome, SLOT_WORDS } from "../components/lesson/slot/slot-focus.ts";
import { AnswerMarksProvider } from "../components/answer-mark.tsx";
import { formatBinding, KEYBOARD_ACTIONS, type AnswerMark, type QuestionAnswerData } from "../src/core/index.ts";

const noop = () => {};
const inLesson = (node: React.ReactNode, marks: Record<string, AnswerMark> = {}) =>
	renderToStaticMarkup(
		<AnswerMarksProvider value={{ marks, onDispute: noop, canDispute: true }}>
			<StickToBottom>{node}</StickToBottom>
		</AnswerMarksProvider>,
	);

const explain = { question: "Why is $A - \\lambda I$ singular?", correctAnswer: "Its kernel is nonzero.", details: "Two sentences." };
const ask = { question: "What next?", options: [{ label: "A worked example" }, { label: "Straight to the computation" }] };

describe("the answer line", () => {
	it("draws a typed question's line with no card: a hairline field, confidence, Hint and Check", () => {
		const html = inLesson(<AnswerSlot toolName="explain" toolCallId="q1" input={explain} onSubmit={noop} />);
		assert.match(html, /data-slot="answer-slot"/);
		assert.match(html, /data-mode="text"/);
		assert.match(html, /border-b border-border/);
		assert.doesNotMatch(html, /rounded-xl bg-card|dock-surface/);
		assert.match(html, /placeholder="Your answer"/);
		assert.match(html, /data-testid="confidence-choice"/);
		assert.match(html, /data-testid="question-hint"/);
		assert.match(html, />Check</);
		assert.match(html, /data-testid="photo-attach"/);
	});

	it("numbers a choice question's rows, adds his own answer, and sends without confidence or Hint", () => {
		const html = inLesson(<AnswerSlot toolName="ask_user_question" toolCallId="q2" input={ask} onSubmit={noop} />);
		assert.equal((html.match(/data-testid="slot-choice"/g) ?? []).length, 2);
		assert.match(html, /role="radio"/);
		assert.match(html, /data-testid="other-option"/);
		assert.match(html, />3</);
		assert.match(html, />Send</);
		assert.doesNotMatch(html, /question-hint|confidence-choice/);
	});

	it("gives a problem its working field, Hint, Show me, Explain instead and Check", () => {
		const html = inLesson(<ProblemSlot problemCallId="p1" onSubmit={noop} onRequest={noop} />);
		for (const id of ["practice-thinking-field", "practice-request-hint", "practice-request-show", "practice-request-explain", "practice-send", "photo-attach"]) assert.match(html, new RegExp(`data-testid="${id}"`));
	});

	it("is skipped by the reply anchor, so a reply starts below the lesson, not below the line", () => {
		assert.match(inLesson(<ProblemSlot problemCallId="p1" onSubmit={noop} onRequest={noop} />), /data-follow-skip=""/);
	});
});

describe("the answer line's records", () => {
	const answered: QuestionAnswerData = { kind: "explain", tool: "explain", questionText: explain.question, options: [], answers: [], text: "The kernel is nonzero.", confidence: "confident", committed: explain.correctAnswer, answeredAt: "2026-11-14T10:00:00Z" };

	it("keeps the question where it was asked and his answer on its line, the tutor's answer behind a disclosure", () => {
		const html = inLesson(<SlotAnswered answerId="q1" answer={answered} input={explain} />);
		assert.match(html, /data-testid="slot-question"/);
		assert.match(html, /data-testid="slot-answered-text"/);
		assert.match(html, /The kernel is nonzero/);
		assert.match(html, /data-testid="slot-reveal"/);
		assert.doesNotMatch(html, /Its kernel is nonzero/); // closed until pressed
		assert.match(html, /data-testid="answered-confidence"/);
	});

	it("draws the mark on one line once the engine holds one, in place of the confidence", () => {
		const mark = { rows: [{ id: "r1", result: "correct", grade: "unaided", helped: false, sure: "confident", label: null }], disputed: false, ruling: null } as unknown as AnswerMark;
		const html = inLesson(<SlotAnswered answerId="q1" answer={answered} input={explain} />, { q1: mark });
		assert.match(html, /data-testid="mark-line"/);
		assert.doesNotMatch(html, /answered-confidence/);
	});

	it("never shows the answer of a question left for next time", () => {
		const html = inLesson(<SlotAnswered answerId="q1" answer={{ kind: "explain", questionText: explain.question, answers: [], dismissed: true, reason: "tonight", answeredAt: "" }} input={explain} />);
		assert.match(html, /Left for next time/);
		assert.doesNotMatch(html, /slot-reveal|kernel is nonzero/);
	});

	it("folds a question he asked help on, and shows his words as a bubble or the hint as one line", () => {
		const hinted = { ...answered, hintRequested: true, committed: undefined, text: undefined };
		const plain = inLesson(<SlotAnswered answerId="q1" answer={hinted} input={explain} />);
		assert.match(plain, /data-folded=""/);
		assert.match(plain, /You asked for a hint/);
		const asked = inLesson(<SlotAnswered answerId="q1" answer={{ ...hinted, thinking: "Do you mean the length?" }} input={explain} />);
		assert.match(asked, /data-testid="user-message"/);
		assert.match(asked, /Do you mean the length\?/);
	});

	it("shows a problem's end as the verdict, then the model solution behind a disclosure", () => {
		const part = { type: "tool-conclude", toolCallId: "c1", state: "output-available", input: { outcome: "solved", verdict: "Pivots in columns 1 and 3." }, reveal: "rank A = 2" } as never;
		const html = inLesson(<SlotConclude part={part} />);
		assert.match(html, /Pivots in columns 1 and 3/);
		assert.match(html, /Solved on your own/);
		assert.match(html, /data-testid="slot-solution"/);
		assert.doesNotMatch(html, /LessonCard|rounded-xl/);
	});

	it("draws what he says to the tutor as a bubble on the right, at most 80% wide", () => {
		const html = renderToStaticMarkup(<SlotBubble text="Looks right, go." />);
		assert.match(html, /ml-auto max-w-\[80%\] rounded-2xl/);
	});

	it("draws a question's details muted under it", () => {
		assert.match(renderToStaticMarkup(<SlotQuestion question="Q" details="Two sentences." />), /text-muted-foreground/);
	});
});

describe("where focus goes while a line is open", () => {
	it("is a typed answer's field, the choices' line itself, or nothing when no line is open", () => {
		const { document } = parseHTML(`<div id="a"><div data-slot="answer-slot" data-mode="text"><textarea data-slot="slot-field"></textarea></div></div><div id="b"><div data-slot="answer-slot" data-mode="single-select"><textarea data-slot="slot-field"></textarea></div></div><div id="c"></div>`);
		assert.equal(slotFocusHome(document.getElementById("a")!)?.tagName, "TEXTAREA");
		assert.equal(slotFocusHome(document.getElementById("b")!)?.getAttribute("data-slot"), "answer-slot");
		assert.equal(slotFocusHome(document.getElementById("c")!), null);
	});

	it("says what the composer is for while a question is open", () => {
		assert.equal(SLOT_WORDS.askAbout, "Ask about this…");
	});
});

describe("the cheat sheet", () => {
	it("lists picking a choice by its number", () => {
		const def = KEYBOARD_ACTIONS.find((a) => a.id === "question-pick-number");
		assert.ok(def?.displayOnly);
		assert.equal(formatBinding(def!.binding), "1–9");
	});
});
