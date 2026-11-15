/**
 * Round 9, lesson reading: what the lesson shows around the tutor's words.
 * M1: the strip read "Pivots in every column" above the prediction asking
 * what the echelon form must look like for Ax = 0 to have only x = 0, and
 * plan_init let that title through.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
// next/link schedules its prefetch on `self`, which linkedom leaves out.
(globalThis as Record<string, unknown>).self = globalThis;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { LessonRoadmap } from "../components/lesson/lesson-roadmap.tsx";
import { predictionOpenOn, roadmapLabel, roadmapSteps } from "../components/lesson/roadmap-facts.ts";
import { planTitlesGiveAway } from "../src/core/plan-tree.ts";
import type { PlanTree } from "../src/core/contracts/plan.ts";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
});

async function mount(node: React.ReactElement) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(node); });
	await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}

function element(selector: string): HTMLElement {
	const node = document.querySelector<HTMLElement>(selector);
	assert.ok(node, `expected ${selector}`);
	return node;
}

const TREE: Pick<PlanTree, "nodes" | "edges"> = {
	nodes: [
		{ id: "kernel", title: "What the kernel holds" },
		{ id: "pivots", title: "Pivots in every column" },
		{ id: "square", title: "One-to-one against onto for square matrices" },
	],
	edges: [{ from: "kernel", to: "pivots" }, { from: "pivots", to: "square" }],
};
const ON_PIVOTS = { current: "pivots", visited: new Set(["kernel", "pivots"]), done: new Set(["kernel"]) };
const PREDICTION = {
	tool: "explain",
	input: { type: "predict", nodeId: "pivots", question: "What must the echelon form of an n × n matrix look like for Ax = 0 to have only x = 0?" },
};

describe("a step's title never answers its own open prediction (round 9 M1)", () => {
	it("the open question is a prediction on the step he is on", () => {
		assert.equal(predictionOpenOn(PREDICTION), "pivots");
		assert.equal(predictionOpenOn({ ...PREDICTION, input: { ...PREDICTION.input, type: "check" } }), null, "a check is asked after the teaching");
		assert.equal(predictionOpenOn(null), null);
	});

	it("the strip shows the dots and no title while the prediction is open", async () => {
		const steps = roadmapSteps(TREE, ON_PIVOTS, new Set(["kernel", "pivots"]), predictionOpenOn(PREDICTION));
		assert.equal(roadmapLabel(steps), "");
		await mount(<LessonRoadmap steps={steps} open={false} onOpenChange={() => {}} onJump={() => {}} />);
		const trigger = element('[data-testid="roadmap"]');
		assert.equal(trigger.querySelectorAll('[data-slot="roadmap-strip"] > span').length, 3, "the dots stay");
		assert.doesNotMatch(trigger.textContent ?? "", /every column/);
		assert.doesNotMatch(trigger.getAttribute("aria-label") ?? "", /every column/);
	});

	it("the panel names the step's place, not its title, while the prediction is open", async () => {
		const steps = roadmapSteps(TREE, ON_PIVOTS, new Set(["kernel", "pivots"]), predictionOpenOn(PREDICTION));
		await mount(<LessonRoadmap steps={steps} open onOpenChange={() => {}} onJump={() => {}} />);
		const row = element('[data-testid="roadmap-step-pivots"]');
		assert.doesNotMatch(row.textContent ?? "", /every column/);
		assert.match(row.textContent ?? "", /Your prediction first.*Now$/);
	});

	it("the title comes back once he has answered, and a check never holds it", () => {
		assert.equal(roadmapLabel(roadmapSteps(TREE, ON_PIVOTS, new Set(["pivots"]), null)), "Pivots in every column");
		assert.equal(roadmapLabel(roadmapSteps(TREE, ON_PIVOTS, new Set(["pivots"]), "kernel")), "Pivots in every column", "a prediction on another step holds nothing here");
	});

	it("plan_init refuses a title that states a condition in words", () => {
		for (const title of ["Pivots in every column", "Invertible exactly when det is nonzero", "One-to-one only if onto", "Rank never changes under row operations"]) {
			const found = planTitlesGiveAway({ nodes: [{ id: "a", title }] });
			assert.ok(found?.includes(JSON.stringify(title)), `refused: ${title}`);
		}
		assert.equal(planTitlesGiveAway({ nodes: [{ id: "a", title: "What the echelon form needs" }, { id: "b", title: "One-to-one against onto for square matrices" }] }), null);
	});
});
