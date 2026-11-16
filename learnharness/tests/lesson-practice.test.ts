/**
 * Practising a whole lesson: the teacher hands practice the lesson's
 * topics, practice covers them all and ends on the chain problem, and a
 * failed combined problem is charged only to the topic where it first broke.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Value } from "typebox/value";

import { conclusionProblem, practiceObservations, type PracticeConclusion } from "../src/core/practice-attempts.ts";
import { practiceHandoffInput } from "../src/agent/tools/handoff.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";

const chain = { statement: "Find the eigenvalues, the eigenspaces, then diagonalize.", topics: ["characteristic-polynomial", "eigenspaces", "diagonalization"] };

describe("a failed problem that runs the whole chain", () => {
	it("is charged only to the topic where his answer first broke, as one observation (round 14, M2)", () => {
		const failed: PracticeConclusion = { outcome: "movedOn", rung: null, result: "incorrect", response: "eigenspace for 3 came out empty", brokeAt: "eigenspaces" };
		assert.equal(conclusionProblem(failed, chain.topics), null);
		assert.deepEqual(practiceObservations(chain, failed, "neutral").map((o) => [o.topics, o.result]), [[["eigenspaces"], "incorrect"]]);
	});

	it("is refused when it would charge every topic with the miss", () => {
		const blanket: PracticeConclusion = { outcome: "movedOn", rung: null, result: "incorrect", response: "wrong" };
		assert.match(conclusionProblem(blanket, chain.topics)!, /brokeAt/);
	});

	it("refuses a break outside the posed topics or on a correct answer", () => {
		assert.match(conclusionProblem({ outcome: "movedOn", rung: null, result: "incorrect", response: "x", brokeAt: "rank" }, chain.topics)!, /not posed/);
		assert.match(conclusionProblem({ outcome: "solved", rung: null, result: "correct", response: "x", brokeAt: "eigenspaces" }, chain.topics)!, /not correct/);
	});

	it("a first try that broke, then a hinted success, keeps the break on its one topic", () => {
		const recovered: PracticeConclusion = {
			outcome: "solvedWithHints", rung: "R1", result: "correct", response: "diagonalized",
			firstTry: { result: "incorrect", response: "empty eigenspace", sure: "confident", brokeAt: "eigenspaces" },
		};
		assert.equal(conclusionProblem(recovered, chain.topics), null);
		const first = practiceObservations(chain, recovered, "neutral")[0]!;
		assert.deepEqual([first.topics, first.result, first.help], [["eigenspaces"], "incorrect", "none"]);
	});
});

describe("the teacher hands practice the whole lesson", () => {
	it("the practice handoff carries the lesson's topics", () => {
		assert.ok(Value.Check(practiceHandoffInput, { scope: "eigenvalues", reason: "lesson taught", topics: ["characteristic-polynomial", "eigenspaces"] }));
	});

	it("the teacher offers the whole lesson and practice covers it, interleaved, ending on the chain", () => {
		assert.match(composeInstructions("teacher"), /offer practice on the whole lesson.*`topics` listing the course topic handles the lesson taught/s);
		const practice = composeInstructions("practice");
		assert.match(practice, /A whole lesson.*interleaved across the set.*end on one composition problem that runs the whole chain/s);
		assert.match(practice, /`brokeAt`, the topic where his answer first broke/);
	});
});
