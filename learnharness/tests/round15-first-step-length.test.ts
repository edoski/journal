/**
 * Round 15, M9 (3 N2): from the probe's last answer to the teaching took
 * about a minute. Most of it is the plan's own thinking, which stays. One
 * part was avoidable: the plan's first step came back refused for length
 * in three of six measured lessons (lens 3's two, one of four fixture
 * runs), each written as four sentences with one over the voice's word
 * limit, which counts as two, so a fifth. Its rewrite is one more reply of
 * the plan's own high effort, 5 to 8 s. The handoff asked for "two to four
 * sentences" without the limit; it now states the limit the guard counts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { HANDOFF_TEXT } from "../src/core/contracts.ts";
import { SENTENCE_BUDGETS, SENTENCE_WORDS, voiceBreaks } from "../src/core/voice-check.ts";

// The refused first step of P5's base-1 run (round 15), as the tutor wrote it.
const REFUSED =
	"The value $e^{-3}$ is right, but it came from the look of $c$, not from a model of how the calls arrive. " +
	"Cut the hour into $n$ equal slices, so short that two calls never land in the same one. " +
	"Each slice then either holds a call or not, with chance $\\frac{3}{n}$ so that the $n$ slices give $3$ calls on average, independently of the other slices. " +
	"So the number of calls in the hour is $\\text{Bin}(n, \\frac{3}{n})$, and letting $n$ grow makes the slicing exact.";

test("a first step of four sentences with one over the word limit is refused for length", () => {
	assert.ok(voiceBreaks(REFUSED, "teach").some((b) => b.rule === "length"), "the guard counted it as five");
	const kept = REFUSED.replace("so that the $n$ slices give $3$ calls on average, independently of the other slices", "independently of the other slices");
	assert.ok(!voiceBreaks(kept, "teach").some((b) => b.rule === "length"), "the same four sentences, each within the limit, pass");
});

test("the handoff asks for the first step in the guard's own count: its budget of sentences, each within the word limit", () => {
	assert.equal(SENTENCE_BUDGETS.teach, 4);
	assert.match(HANDOFF_TEXT, new RegExp(`one idea in two to four sentences, each of ${SENTENCE_WORDS} words or fewer, since a longer one counts as two`));
});
