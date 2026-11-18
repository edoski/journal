/**
 * The topic page's lesson map marks as Next the step the lesson's ⌘K
 * panel calls next (round 11, 3 n6, shots 19 and 12): the map marked
 * "Conditions for invertibility side by side" Next, the 2×2 inverse's
 * successor in the graph, while it still needed four untaught steps and
 * the panel said Row reducing was next.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextSteps } from "../components/unit-inbox/topic-page/hybrid/hybrid-facts.ts";
import { roadmapSteps } from "../components/lesson/roadmap-facts.ts";
import type { SessionPlan } from "../src/core/contracts/topic.ts";

const node = (id: string) => ({ id, title: id });
const PLAN: SessionPlan = {
	id: "chat_inv",
	tree: {
		nodes: ["undo", "inverse-2x2", "row-reduce", "pivots", "rank-n", "det-nonzero", "conditions"].map(node),
		edges: [
			{ from: "undo", to: "inverse-2x2" },
			{ from: "undo", to: "row-reduce" },
			{ from: "row-reduce", to: "pivots" },
			{ from: "pivots", to: "rank-n" },
			{ from: "rank-n", to: "det-nonzero" },
			{ from: "inverse-2x2", to: "conditions" },
			{ from: "det-nonzero", to: "conditions" },
		],
	},
	current: "inverse-2x2",
	visited: ["undo"],
};

describe("the lesson map's Next (3 n6)", () => {
	it("is the one step the lesson's panel calls next", () => {
		const panel = roadmapSteps(PLAN.tree, { current: PLAN.current, visited: new Set(PLAN.visited), done: new Set() }, new Set()).find((step) => step.next)!.id;
		assert.equal(panel, "row-reduce");
		assert.deepEqual([...nextSteps(PLAN)], [panel]);
	});

	it("is nothing once every step was asked about", () => {
		assert.deepEqual([...nextSteps({ ...PLAN, current: "conditions", visited: PLAN.tree.nodes.map((n) => n.id).filter((id) => id !== "conditions") })], []);
	});
});
