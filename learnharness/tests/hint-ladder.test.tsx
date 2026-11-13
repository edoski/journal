/**
 * Hints climb a ladder: a Hint press on a check is a request, never an
 * answer, so the committed answer (a whole proof, say) stays hidden, and
 * every agent that teaches reads the same ladder.
 */

import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { buildAnswer, compactAnswerForModel, type QuestionData } from "../src/core/question-core.ts";
import { AnsweredCard } from "../components/answered-card.tsx";
import { QuestionDock } from "../components/question-dock.tsx";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

const PROOF = "Suppose $e$ and $e'$ are both identities. Then $e = ee' = e'$.";
const check: QuestionData = { id: "q1", kind: "explain", question: "Prove the identity is unique.", mode: "text", options: [], committedAnswer: PROOF, createdAt: "2026-11-13T20:00:00Z" };

describe("a Hint press on a check", () => {
	it("is saved as a hint request with no committed answer and no confidence", () => {
		const answer = buildAnswer(check, { text: "take two identities?", hint: true }, "recall");
		assert.equal(answer.hintRequested, true);
		assert.equal(answer.committed, undefined);
		assert.equal(answer.confidence, undefined);
	});

	it("tells the agent it is a request for the next rung, not an answer", () => {
		const model = compactAnswerForModel(buildAnswer(check, { text: "stuck", hint: true }, "recall"));
		assert.match(String(model.hintRequested), /not an answer.*next rung/);
	});

	it("never reveals the proof in the transcript, while a real answer still does", () => {
		const input = { question: check.question, correctAnswer: PROOF };
		const hinted = renderToStaticMarkup(<AnsweredCard answer={buildAnswer(check, { text: "stuck", hint: true }, "recall")} input={input} variant="proposed" />);
		assert.doesNotMatch(hinted, /The answer/);
		assert.match(hinted, /You asked for a hint/);
		const answered = renderToStaticMarkup(<AnsweredCard answer={buildAnswer(check, { text: "e = ee' = e'" }, "recall")} input={input} variant="proposed" />);
		assert.match(answered, /The answer/);
	});

	it("the check box offers Hint beside Submit, and a plain question does not", () => {
		const explain = renderToStaticMarkup(
			<QuestionDock toolName="explain" toolCallId="q1" input={{ question: "Why?", correctAnswer: "Because.", nodeId: "a", type: "check" } as never} expanded onExpand={() => {}} onSubmit={() => {}} variant="proposed" />,
		);
		assert.match(explain, /data-testid="question-hint"/);
		const ask = renderToStaticMarkup(
			<QuestionDock toolName="ask_user_question" toolCallId="q2" input={{ question: "Which?" }} expanded onExpand={() => {}} onSubmit={() => {}} variant="proposed" />,
		);
		assert.doesNotMatch(ask, /data-testid="question-hint"/);
	});
});

describe("the ladder in every teaching prompt", () => {
	for (const agent of ["teacher", "practice"] as const) {
		it(`${agent}: hints climb from a question to a nudge to a step, and only show me reveals the rest`, () => {
			const prompt = courseRecordPrompt(agent);
			assert.match(prompt, /first a question that points him at what to look at.*then a nudge.*then one step/s);
			assert.match(prompt, /never gives the whole solution or the whole proof\. Only "show me" reveals the rest/);
		});
	}
	it("prober and teacher: a hint request on a check is never answered with the committed answer", () => {
		for (const agent of ["prober", "teacher"] as const) {
			assert.match(composeInstructions(agent, {}), /A hint request is not an answer.*never the committed answer, never the proof/s);
		}
	});
});
