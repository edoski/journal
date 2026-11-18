/**
 * Round 16, m15 (1 m1): after "Yes" in the Ask flow, the tutor's message
 * held the question and "Your turn" printed it again, word for word. A
 * question whose words already end the tutor's text above it draws only
 * its "Your turn" mark.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { spokenAbove } from "../components/lesson/prose/prose-question-data.ts";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";

const QUESTION = "Events $A$ and $B$ have $P(A) = 0.3$ and $P(B) = 0.4$, and they are disjoint. Are $A$ and $B$ independent, and why?";
const check = { type: "check", nodeId: "independence", question: QUESTION, correctAnswer: "No" };
const message = (text: string, input: unknown = check) => ({
	parts: [{ type: "step-start" }, { type: "text", text }, { type: "tool-explain", toolCallId: "q1", state: "input-available", input }],
});

describe("a question the tutor's reply already asks (round 16, m15)", () => {
	it("is found when the reply ends with its words, in any spacing or markup", () => {
		assert.deepEqual([...spokenAbove([message(QUESTION)])], ["q1"]);
		assert.deepEqual([...spokenAbove([message(`Good, let's start.\n\n${QUESTION.replace(/ /g, "  ")}`)])], ["q1"]);
		assert.deepEqual([...spokenAbove([message(`**${QUESTION}**`)])], ["q1"]);
	});

	it("is not when the reply says something else, or a card sits between them", () => {
		assert.deepEqual([...spokenAbove([message("Here is your Independent events review.")])], []);
		assert.deepEqual([...spokenAbove([{ parts: [{ type: "text", text: QUESTION }, { type: "tool-demo", toolCallId: "d1" }, { type: "tool-explain", toolCallId: "q1", input: check }] }])], []);
		assert.deepEqual([...spokenAbove([{ parts: [{ type: "text", text: QUESTION }] }, { parts: [{ type: "tool-explain", toolCallId: "q1", input: check }] }])], [], "another message");
	});

	it("draws only Your turn, open or answered", () => {
		const open = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="q1" input={check} open spoken />);
		assert.match(open, /Your turn</);
		assert.doesNotMatch(open, /disjoint|on the question above/);
		const answered = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="q1" input={check} open={false} spoken output={{ kind: "explain", questionText: QUESTION, answers: [], text: "No, P(A∩B) = 0", answeredAt: "" } as never} />);
		assert.doesNotMatch(answered, /disjoint/);
		assert.match(answered, /P\(A∩B\) = 0/);
		assert.match(renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="q1" input={check} open />), /disjoint/, "not spoken above: its words are drawn");
	});
});
