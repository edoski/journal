import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conclusionProblem, practiceObservations, type PracticeConclusion } from "../src/core/practice-attempts.ts";

const POSE = { statement: "Is $x \\mapsto 2x$ linear?", topics: ["linearity"] };
const base: PracticeConclusion = { outcome: "solved", rung: null, result: "correct", response: "Yes, additive and homogeneous" };

describe("a concluded practice problem as engine observations", () => {
	it("solved without hints is one unaided attempt", () => {
		assert.deepEqual(practiceObservations(POSE, base, {}), [
			{ topics: ["linearity"], text: POSE.statement, response: "Yes, additive and homogeneous", help: "none", result: "correct" },
		]);
	});

	it("a hinted success records the hint in words, after his first unaided try", () => {
		const observations = practiceObservations(
			POSE,
			{ ...base, outcome: "solvedWithHints", rung: "R3", firstTry: { result: "incorrect", response: "No" } },
			{ first: "confident", last: "neutral" },
		);
		assert.deepEqual(observations.map((o) => [o.help, o.result, o.response]), [
			["none", "incorrect", "No"],
			["Hint R3: named the idea to use", "correct", "Yes, additive and homogeneous"],
		]);
	});

	it("a first try equal to the final unaided result adds nothing", () => {
		assert.equal(practiceObservations(POSE, { ...base, firstTry: { result: "correct", response: "Yes" } }, {}).length, 1);
	});

	it("a wrongly chosen method rides on the attempt", () => {
		const [o] = practiceObservations(POSE, { ...base, outcome: "surrendered", result: "incorrect", chose: "affinity" }, {});
		assert.equal(o!.chose, "affinity");
	});

	it("refuses conclusions that contradict their outcome", () => {
		assert.match(conclusionProblem({ ...base, outcome: "surrendered" })!, /incorrect/);
		assert.match(conclusionProblem({ ...base, result: "incorrect" })!, /correct or partial/);
		assert.match(conclusionProblem({ ...base, outcome: "solvedWithHints" })!, /rung/);
		assert.match(conclusionProblem({ ...base, rung: "R0" })!, /solvedWithHints/);
		assert.match(conclusionProblem({ ...base, chose: "affinity" })!, /not correct/);
		assert.equal(conclusionProblem({ ...base, result: "partial" }), null, "a guessed right answer is partial");
		assert.equal(conclusionProblem({ ...base, outcome: "movedOn", result: "incorrect" }), null);
	});
});
