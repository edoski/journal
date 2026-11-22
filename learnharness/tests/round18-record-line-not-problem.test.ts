/**
 * Round 18, m2 (2 m2): in Rank practice he answered "k = 5" at Confident,
 * then right after the nudge. The conclude's first try carried no record
 * line, so o123's text was the problem's statement, and Independence's
 * Earlier read "In ℝ³, let u = (1,0,2), v = (0,1,1) and w_k = (2,3,k)… For
 * which value of k … · Sure, but wrong". A not-right answer the conclude
 * saves says what he did; one with no line of its own is refused, and the
 * problem is never an observation's text.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { practiceObservations, recordLineProblem, type PracticeConclusion } from "../src/core/practice-attempts.ts";

const statement = "In $\\mathbb{R}^3$, let $u = (1,0,2)$, $v = (0,1,1)$ and $w_k = (2,3,k)$. For which value of $k$ is the set $\\{u, v, w_k\\}$ linearly dependent, and why?";
const pose = { statement, topics: ["independence"] };
const lens = { outcome: "solvedWithHints", rung: "R1", result: "correct", response: "k = 7", record: "Found $k = 7$ from the third entries after the nudge", firstTry: { result: "incorrect", response: "k = 5", sure: "confident" } } as PracticeConclusion;

test("a not-right answer with no line of its own is refused, and a line that is the problem too", () => {
	assert.match(recordLineProblem(lens, statement) ?? "", /^firstTry\.record: an answer's record says what he did/);
	assert.match(recordLineProblem({ ...lens, firstTry: { ...lens.firstTry!, record: ` ${statement}` } }, statement) ?? "", /^firstTry\.record/);
	assert.match(recordLineProblem({ outcome: "movedOn", rung: null, result: "partial", response: "k = 5" }, statement) ?? "", /^record:/);
});

test("the conclusion it asks for saves what he did, and no observation's text is the problem", () => {
	const fixed = { ...lens, firstTry: { ...lens.firstTry!, record: "Took the third entry of $v$ as $0$ and got $k = 5$" } } as PracticeConclusion;
	assert.equal(recordLineProblem(fixed, statement), null);
	assert.equal(recordLineProblem({ ...lens, firstTry: undefined }, statement), null);
	// Round 19, m3: a right answer's line says what he did too.
	assert.match(recordLineProblem({ ...lens, record: statement, firstTry: undefined }, statement) ?? "", /^record:/);
	const observations = practiceObservations(pose, fixed, "neutral");
	assert.ok(observations.every((o) => o.text !== statement), JSON.stringify(observations));
	assert.equal(observations[0]!.text, "Took the third entry of $v$ as $0$ and got $k = 5$");
});
