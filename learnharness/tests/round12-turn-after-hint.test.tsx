/**
 * Round 12, 3 D11: after a hint that is itself a question ("Since C sends
 * (1, 0) to (0, 1), where must C⁻¹ send (0, 1)?"), the re-asked question's
 * mark read "Your turn, on the question above", and the question just
 * above it was the hint's. After a hint the mark is "Your turn" alone (Edo,
 * 18 Nov 2026: "Your turn, on the question you pressed Hint on" cut, since
 * his Hint bubble under the question already shows it); after his side
 * question it still says "above".
 */
import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { askedAfterHint, proseAnswer, proseHintRequest, proseQuestionSpec } from "../components/lesson/prose/prose-question-data.ts";
import { YourTurn } from "../components/lesson/prose/prose-question.tsx";
import { dismissedAnswer, emptyDockSelection } from "../src/core/index.ts";

const check = { question: "What is $C^{-1}$, and why?", correctAnswer: "The quarter turn back.", type: "check" };
const ask = (id: string, input: unknown, output?: unknown) => ({ type: "tool-explain", toolCallId: id, input, output });
const words = { type: "text" };

describe("the mark after a hint is Your turn alone", () => {
	it("a re-ask after a hint is known as one", () => {
		const hinted = proseHintRequest(proseQuestionSpec("explain", "q1", check)!, "C^-1 = C ?");
		assert.deepEqual([...askedAfterHint([{ parts: [ask("q1", check, hinted)] }, { parts: [words, ask("q2", check)] }])], ["q2"]);
	});

	it("a re-ask after his side question is not", () => {
		const aside = dismissedAnswer("explain", check.question, "asked");
		assert.deepEqual([...askedAfterHint([{ parts: [ask("q1", check, aside)] }, { parts: [words, ask("q2", check)] }])], []);
		assert.equal(proseAnswer(proseQuestionSpec("explain", "q1", check)!, emptyDockSelection(), "x", "neutral").text, "x");
	});

	it("the mark's words", () => {
		assert.match(renderToStaticMarkup(<YourTurn above afterHint />), />Your turn<\/p>/);
		assert.match(renderToStaticMarkup(<YourTurn above />), /Your turn, on the question above/);
	});
});
