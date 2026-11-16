/**
 * The step strip keeps its place and its length (round 13, 2 n5). In the
 * Eigen lesson the strip read step 6 of 7, "Computing a 2 × 2 spectrum",
 * then went back to "Finding the eigenvectors for a given λ", a step it
 * rests on that the tutor asked about late, then to 6 dots and "Every step
 * taught" when a rewrite of the plan dropped the eigenbasis step still to
 * come. The calls are the evaluator's record of chat_demo_eigen.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTree, derivePlanStatusesLh, planDropsSteps } from "../src/core/index.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

const node = (id: string, title: string) => ({ id, title });
const SEVEN = createTree(
	[node("maps", "Matrices as linear maps"), node("invariant", "Vectors a matrix keeps on their line"), node("equation", "The equation an eigenvector satisfies"), node("charpoly", "Where the determinant comes in"), node("eigenspace", "Finding the eigenvectors for a given $\\lambda$"), node("compute", "Computing a $2 \\times 2$ spectrum"), node("diagonal", "What an eigenbasis does to a matrix")],
	[{ from: "maps", to: "invariant" }, { from: "invariant", to: "equation" }, { from: "equation", to: "charpoly" }, { from: "equation", to: "eigenspace" }, { from: "charpoly", to: "compute" }, { from: "eigenspace", to: "compute" }, { from: "compute", to: "diagonal" }],
);
const SIX = createTree(SEVEN.nodes.filter((n) => n.id !== "diagonal"), SEVEN.edges.filter((e) => e.to !== "diagonal"));

let n = 0;
const call = (name: string, args: unknown): LhMessage => ({ id: `a${++n}`, role: "assistant", content: [{ type: "toolCall", id: `c${n}`, name, arguments: args }], api: "faux", provider: "test", model: "test", usage: {}, stopReason: "toolUse", timestamp: n }) as unknown as LhMessage;
const RECORD = [call("explain", { type: "check", nodeId: "equation" }), call("lesson_progress", { done: ["maps", "invariant", "equation", "charpoly"] }), call("explain", { type: "check", nodeId: "compute" }), call("explain", { type: "check", nodeId: "eigenspace" })];

describe("the step strip keeps its place and its length (2 n5)", () => {
	it("a question on a step the current one rests on marks it taught and leaves the strip on step 6", () => {
		const s = derivePlanStatusesLh(SEVEN, RECORD);
		assert.equal(s.current, "compute");
		assert.ok(s.visited.has("eigenspace"));
	});

	it("a step after the current one still moves it forward", () => {
		assert.equal(derivePlanStatusesLh(SEVEN, [...RECORD, call("explain", { type: "check", nodeId: "diagonal" })]).current, "diagonal");
	});

	it("a rewrite of the lesson that drops a step still to come is refused, once teaching began", () => {
		const done = derivePlanStatusesLh(SEVEN, RECORD).done;
		assert.match(planDropsSteps(SEVEN, SIX, true, done) ?? "", /diagonal/);
		assert.equal(planDropsSteps(SEVEN, SIX, false, done), null, "before any step is taught, the map may change freely");
		assert.equal(planDropsSteps(SEVEN, createTree([node("binomial-limit", "Where the binomial goes")], []), true, done), null, "a map on another lesson keeps none of its steps");
		assert.equal(planDropsSteps(SEVEN, SIX, true, new Set([...done, "diagonal"])), null, "a step marked done may go");
	});
});
