import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { latestTree, topoFor, type PopupMessage } from "../components/lesson/plan-facts.ts";
import type { PlanTree } from "../src/core/contracts.ts";

const CHAIN: PlanTree = {
	nodes: [
		{ id: "a", title: "Alpha node" },
		{ id: "b", title: "Beta node" },
		{ id: "c", title: "Gamma node" },
	],
	edges: [
		{ from: "a", to: "b" },
		{ from: "b", to: "c" },
	],
	version: 1,
};

describe("plan facts", () => {
	it("orders a chain after what each step rests on, with its depth", () => {
		const { order, depth } = topoFor(CHAIN.nodes, CHAIN.edges);
		assert.deepEqual(order.map((n) => n.id), ["a", "b", "c"]);
		assert.equal(depth.get("c"), 2);
	});

	it("reads the latest finished plan call's tree", () => {
		const rewritten: PlanTree = { ...CHAIN, nodes: CHAIN.nodes.slice(0, 2), edges: CHAIN.edges.slice(0, 1), version: 2 };
		const messages: PopupMessage[] = [
			{ parts: [{ type: "tool-plan_init", state: "output-available", output: { ok: true, tree: CHAIN } }] },
			{ parts: [{ type: "tool-plan_init", state: "output-available", output: { ok: true, tree: rewritten } }, { type: "tool-plan_init", state: "input-available" }] },
		];
		assert.equal(latestTree(messages)?.version, 2);
		assert.equal(latestTree([{ parts: [{ type: "text" }] }]), null);
	});
});
