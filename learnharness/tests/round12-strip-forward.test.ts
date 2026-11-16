/**
 * Round 12, 2 n6: in the Eigen lesson the step strip read step 7 "An
 * eigenbasis makes A diagonal", then went back to step 6 "Computing a 2×2
 * spectrum" for the closing recall question, tagged with that done step.
 * The strip moves only forward: a question on a step already done is a
 * recall check, and the position stays where it was.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTree, derivePlanStatuses } from "../src/core/index.ts";

const ids = ["maps", "invariant", "equation", "charpoly", "eigenspace", "compute", "diagonal"];
const tree = createTree(
	ids.map((id) => ({ id, title: id })),
	ids.slice(1).map((id, i) => ({ from: ids[i]!, to: id })),
);
const ask = (nodeId: string) => ({ parts: [{ type: "tool-explain", input: { type: "check", nodeId, question: "Q?" } }] });
const progress = (...done: string[]) => ({ parts: [{ type: "tool-lesson_progress", input: { done } }] });

describe("the step strip moves only forward", () => {
	it("a recall check on a done step leaves the position where it was", () => {
		const s = derivePlanStatuses(tree, [ask("compute"), progress("eigenspace", "compute"), ask("diagonal"), progress("diagonal"), ask("compute")] as never);
		assert.notEqual(s.current, "compute");
	});

	it("a check on the step he is on, or the next, still moves it", () => {
		const s = derivePlanStatuses(tree, [ask("compute"), progress("compute"), ask("diagonal")] as never);
		assert.equal(s.current, "diagonal");
	});
});
