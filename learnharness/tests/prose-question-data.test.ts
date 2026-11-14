/** The Prose lesson's reading of an open question (prose-question-data.ts). */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { digitOption, proseAnswer, proseAnswerReady, proseHintRequest, prosePlaceholder, proseQuestionSpec } from "../components/lesson/prose/prose-question-data.ts";
import { emptyDockSelection } from "../src/core/index.ts";

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
