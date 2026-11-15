/** The Prose lesson's reading of an open question (prose-question-data.ts). */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { askedAgain, digitOption, proseAnswer, proseAnswerReady, proseHintRequest, prosePlaceholder, proseQuestionSpec } from "../components/lesson/prose/prose-question-data.ts";
import { dismissedAnswer, emptyDockSelection } from "../src/core/index.ts";

const check = { question: "Which way does $A$ stretch?", correctAnswer: "Along $(1,1)$, by 3.", type: "check" };
const predict = { ...check, type: "predict" };
const choice = { question: "What next?", options: [{ label: "Practice" }, { label: "Eigenvalues" }] };
const many = { ...choice, multiSelect: true };
const picked = (...i: number[]) => ({ selected: new Set(i), otherSelected: false });

describe("the Prose question", () => {
	it("reads a check, a prediction and a choice from the tool call", () => {
		assert.equal(proseQuestionSpec("explain", "c1", check)?.mode, "text");
		assert.equal(proseQuestionSpec("explain", "c1", check)?.data.committedAnswer, check.correctAnswer);
		assert.equal(proseQuestionSpec("ask_user_question", "c2", choice)?.mode, "single-select");
		assert.equal(proseQuestionSpec("ask_user_question", "c2", many)?.mode, "multi-select");
		assert.equal(proseQuestionSpec("ask_user_question", "c2", choice)?.takesOwnAnswer, true);
		assert.equal(proseQuestionSpec("explain", "c3", { question: 3 }), null);
	});

	it("says in the field what the question wants, in literal words", () => {
		assert.equal(prosePlaceholder(proseQuestionSpec("explain", "c", predict)!, predict, false), "Your prediction, and why");
		assert.equal(prosePlaceholder(proseQuestionSpec("explain", "c", check)!, check, false), "Your answer");
		assert.equal(prosePlaceholder(proseQuestionSpec("recall", "c", check)!, check, false), "Your answer");
		const ask = proseQuestionSpec("ask_user_question", "c", choice)!;
		assert.equal(prosePlaceholder(ask, choice, false), "Pick one above, or write your own answer");
		assert.equal(prosePlaceholder(ask, choice, true), "Anything to add?");
		assert.equal(prosePlaceholder(proseQuestionSpec("ask_user_question", "c", many)!, many, false), "Pick any above, or write your own answer");
	});

	it("is ready with words, a photo, a pick, or an ask's own answer", () => {
		const text = proseQuestionSpec("explain", "c", check)!;
		assert.equal(proseAnswerReady(text, emptyDockSelection(), " ", 0), false);
		assert.equal(proseAnswerReady(text, emptyDockSelection(), "", 1), true);
		const ask = proseQuestionSpec("ask_user_question", "c", choice)!;
		assert.equal(proseAnswerReady(ask, emptyDockSelection(), "", 0), false);
		assert.equal(proseAnswerReady(ask, picked(1), "", 0), true);
		assert.equal(proseAnswerReady(ask, emptyDockSelection(), "Something else", 0), true);
	});

	it("makes his field the answer, his own answer, or what he adds to a pick", () => {
		const text = proseAnswer(proseQuestionSpec("explain", "c", check)!, emptyDockSelection(), "  by 3  ", "confident");
		assert.equal(text.text, "by 3");
		assert.equal(text.confidence, "confident");
		assert.equal(text.committed, check.correctAnswer);
		const ask = proseQuestionSpec("ask_user_question", "c", choice)!;
		const own = proseAnswer(ask, emptyDockSelection(), "Something else", "neutral");
		assert.equal(own.other, "Something else");
		assert.equal(own.thinking, undefined);
		const added = proseAnswer(ask, picked(1), "because the exam", "neutral");
		assert.deepEqual(added.answers.map((a) => a.label), ["Eigenvalues"]);
		assert.equal(added.thinking, "because the exam");
		assert.equal(added.other, undefined);
	});

	it("asks for a hint without the committed answer, carrying his words", () => {
		const hint = proseHintRequest(proseQuestionSpec("explain", "c", check)!, "it stretches");
		assert.equal(hint.hintRequested, true);
		assert.equal(hint.committed, undefined);
		assert.equal(hint.text, "it stretches");
	});

	it("picks the options by the digits 1 to 9, in order", () => {
		assert.equal(digitOption("1", 3), 0);
		assert.equal(digitOption("3", 3), 2);
		assert.equal(digitOption("4", 3), null);
		assert.equal(digitOption("0", 3), null);
		assert.equal(digitOption("a", 3), null);
	});
});

describe("a question asked again after a hint", () => {
	const spec = proseQuestionSpec("explain", "q1", check)!;
	const hinted = proseHintRequest(spec, "it stretches somewhere?");
	const answered = proseAnswer(spec, emptyDockSelection(), "Along (1,1)", "confident");
	const ask = (id: string, input: unknown, output?: unknown) => ({ type: "tool-explain", toolCallId: id, input, output });
	const hint = { type: "text" };

	it("is drawn once when its words are the same, however they are spaced", () => {
		const spaced = { ...check, question: "Which way does   $A$\nstretch?" };
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, hinted)] }, { parts: [hint, ask("q2", spaced)] }])], ["q2"]);
	});

	it("stays drawn after each of several hints", () => {
		const second = proseHintRequest(proseQuestionSpec("explain", "q2", check)!, "");
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, hinted), hint, ask("q2", check, second), hint, ask("q3", check)] }])], ["q2", "q3"]);
	});

	it("is drawn once after a side question set it aside", () => {
		const aside = dismissedAnswer("explain", check.question, "asked");
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, aside)] }, { parts: [hint, ask("q2", check)] }])], ["q2"]);
		const skipped = dismissedAnswer("explain", check.question);
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, skipped)] }, { parts: [hint, ask("q2", check)] }])], [], "a skip is not set aside");
	});

	it("is drawn once when reworded too: a re-ask is the same question (round 8: the question printed twice after a hint and after an Ask)", () => {
		const reworded = { ...check, question: "Along which line does $A$ stretch vectors?" };
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, hinted), ask("q2", reworded)] }])], ["q2"]);
		const aside = dismissedAnswer("explain", check.question, "asked");
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, aside)] }, { parts: [hint, ask("q2", reworded)] }])], ["q2"]);
	});

	it("is drawn once when asked again word for word after his answer, as after a question he sent as his answer by mistake (round 10, 2 m7)", () => {
		const asQuestion = proseAnswer(spec, emptyDockSelection(), "Why does independence matter here?", "neutral");
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, asQuestion)] }, { parts: [hint, ask("q2", check)] }])], ["q2"]);
		const other = { ...check, question: "Which way does $B$ stretch?" };
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, asQuestion)] }, { parts: [hint, ask("q2", other)] }])], [], "a new question after his answer is drawn in full");
	});

	it("draws a different question after a hint in full: another step, or another form", () => {
		const onStep = { ...check, nodeId: "stretch" };
		const otherStep = { ...check, nodeId: "det", question: "What is $\\det A$?" };
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", onStep, hinted), hint, ask("q2", otherStep)] }])], []);
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", onStep, hinted), hint, ask("q2", { ...onStep, question: "Which line does $A$ stretch?" })] }])], ["q2"]);
		const picks = { ...check, options: [{ label: "Along (1,1)" }, { label: "Along (1,-1)" }] };
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, hinted), hint, ask("q2", picks)] }])], []);
	});

	it("skips a re-ask the guard refused: the call after it is the one he reads (round 8, this fix's live run)", () => {
		const refused = { type: "tool-explain", toolCallId: "q2", state: "output-error", input: check };
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, hinted), hint, refused, ask("q3", check)] }])], ["q3"]);
	});

	it("draws a question that follows an answer", () => {
		assert.deepEqual([...askedAgain([{ parts: [ask("q1", check, answered), ask("q2", check)] }])], []);
	});
});
