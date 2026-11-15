/** Every mark tells the truth the record holds (round 5): the answer card
 *  and the topic page's Earlier read one derivation of how an attempt
 *  counted, so the same attempt never says two things. */

import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { answerMarksOf } from "../src/core/answer-marks.ts";
import { topicRecordOf } from "../src/server/topic.ts";
import { RowFacts } from "../components/answer-mark.tsx";
import { attemptMark } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { concludeInputObject } from "../src/agent/tools/practice.ts";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** One engine observation as `show` returns it, on the eigen topic. */
const evidence = {
	prediction: { kind: "attempt", topics: ["eigen"], date: "2026-11-08", text: "Which directions stay on their line?", result: "partial", help: "none", predicted: true, sure: "guess", grade: "helped" },
	gaveUp: { kind: "attempt", topics: ["eigen"], date: "2026-11-08", text: "P(X=k)?", result: "incorrect", help: "Hint: which values does at least 2 leave out?", gave_up: true, grade: "missed" },
	guess: { kind: "attempt", topics: ["eigen"], date: "2026-11-08", text: "|a-b|", result: "correct", help: "none", sure: "guess", grade: "helped" },
	hinted: { kind: "attempt", topics: ["eigen"], date: "2026-11-08", text: "Binomial", result: "correct", help: "Hint: which values?", sure: "neutral", grade: "helped" },
	own: { kind: "attempt", topics: ["eigen"], date: "2026-11-08", text: "det", result: "correct", help: "none", sure: "neutral", grade: "solid" },
} as const;
type Case = keyof typeof evidence;

const card = (which: Case) => {
	const mark = answerMarksOf({ a: [which] }, { [which]: evidence[which] }).a!;
	return text(renderToStaticMarkup(<RowFacts row={mark.rows[0]!} />));
};
const earlier = (which: Case) => {
	const show = { items: { eigen: { kind: "topic", observations: [which] } }, evidence: { [which]: evidence[which] } };
	return attemptMark(topicRecordOf(show, "eigen", [])!.attempts[0]!, (h) => h);
};

describe("the mark on the card and in Earlier", () => {
	it("calls a prediction a prediction that never counts, on both", () => {
		assert.equal(earlier("prediction").words, "Prediction, not counted");
		assert.match(card("prediction"), /Partly right Prediction, not counted Guessing/);
		assert.doesNotMatch(card("prediction"), /helped|On your own/);
	});

	it("says Gave up on both for an answer he gave up on", () => {
		assert.equal(earlier("gaveUp").words, "Gave up");
		assert.match(card("gaveUp"), /Gave up/);
		assert.doesNotMatch(card("gaveUp"), /Not right/, "one chip for one fact (round 8: Not right · Gave up)");
		assert.doesNotMatch(card("gaveUp"), /With help/);
	});

	it("says how a right answer counted in the same words on both", () => {
		assert.ok(card("hinted").includes(earlier("hinted").words!), "the card says With help");
		for (const which of ["guess", "own"] as const) {
			assert.equal(earlier(which).words, null, `${which}: Earlier says nothing of his own work`);
			assert.match(card(which), /On your own/, `${which}: no help, so his own, a guess included (round 6)`);
		}
	});

	it("shows no confidence he did not choose: Neutral is the meter left alone", () => {
		assert.doesNotMatch(card("hinted"), /Neutral/);
		assert.doesNotMatch(card("own"), /Neutral/);
		assert.match(card("guess"), /Guessing/);
	});
});

describe("a partly right answer", () => {
	// Round 5: "your rank and dim ker are right, the pivot columns are not"
	// was saved Not right, because partial meant only a right result on bad
	// reasoning.
	const partlyRight = /some of its parts right and others not/;

	it("is partial in the doctrine every tutor reads", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) assert.match(courseRecordPrompt(agent, { arcs: false }), partlyRight, agent);
	});

	it("is partial in the result a practice problem concludes with", () => {
		const result = (concludeInputObject.properties.result as { description?: string }).description ?? "";
		assert.match(result, partlyRight);
	});
});
