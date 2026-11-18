/**
 * Round 16, m10 (3 m2): the "You …, whereas …" closer came back in 2 of 3
 * review feedbacks (32, 34), with a verb other than round 14's "held
 * that": "You counted one arrangement for one head, whereas the binomial
 * coefficient counts all six." It restates the break the reply just said.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks, type TurnKind } from "../src/core/voice-check.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";

const rules = (text: string, kind: TurnKind = "wrong") => voiceBreaks(text, kind).map((b) => b.rule);

describe("no \"You …, whereas …\" closer, whatever its verb (round 16, m10)", () => {
	it("refuses the recorded review closers", () => {
		for (const text of [
			"The draws are not independent, since the first bulb out changes what is left. You checked $n$ and the first draw's $p$, whereas a binomial count also needs every trial independent with the same $p$.",
			"The count misses the arrangements: one head can land on any of the six flips, so the term is $\\binom{6}{1}(1/2)^6$ and the total is $57/64$. You counted one arrangement for one head, whereas the binomial coefficient counts all six.",
		]) assert.ok(rules(text).includes("contrast"), text);
	});

	it("leaves a teaching contrast and one that opens on the maths alone", () => {
		assert.ok(!rules("You get one solution when $\\det A \\neq 0$, whereas a zero determinant leaves none or infinitely many.", "teach").includes("contrast"));
		assert.ok(!rules("One head can land on any of the six flips, whereas two heads can land in fifteen ways.").includes("contrast"));
	});

	it("the voice names the formula by its shape, not one verb", () => {
		assert.match(composeInstructions("teacher"), /never a formula that sets what he did against what is true/);
	});
});
