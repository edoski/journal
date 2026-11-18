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
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { LessonRoadmap } from "../components/lesson/lesson-roadmap.tsx";
import { lessonRoadmapSteps, roadmapLabel, roadmapSteps } from "../components/lesson/roadmap-facts.ts";
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
		{ id: "pivots", title: "What the echelon form needs" },
		{ id: "square", title: "One-to-one against onto for square matrices" },
	],
	edges: [{ from: "kernel", to: "pivots" }, { from: "pivots", to: "square" }],
};
const ON_PIVOTS = { current: "pivots", visited: new Set(["kernel", "pivots"]), done: new Set(["kernel"]) };

describe("a step's title names its idea, a prediction on it open or not (round 9 M1; round 15, m15)", () => {
	const TREE_15: Pick<PlanTree, "nodes" | "edges"> = {
		nodes: [
			{ id: "undo-map", title: "What it takes to undo a map" },
			{ id: "flattening", title: "Maps that flatten space" },
			{ id: "det-test", title: "The determinant as a test for an inverse" },
		],
		edges: [{ from: "undo-map", to: "flattening" }, { from: "flattening", to: "det-test" }],
	};

	/** The lesson as the transcript holds it: the first two steps done, and
	 *  his prediction on the third open, its question not answered. */
	const transcript = [
		{ parts: [{ type: "tool-explain", input: { type: "check", nodeId: "undo-map", question: "q1" } }, { type: "tool-lesson_progress", input: { done: ["undo-map"] } }] },
		{ parts: [{ type: "tool-explain", input: { type: "check", nodeId: "flattening", question: "q2" } }, { type: "tool-lesson_progress", input: { done: ["flattening"] } }] },
		{ parts: [{ type: "tool-explain", input: { type: "predict", nodeId: "det-test", question: "What do you expect has to give when a map flattens space?" } }] },
	];
	const tree = { ...TREE_15, goal: { title: "Invertible matrices" } } as unknown as PlanTree;

	it("the strip names the step he is on while his prediction on it is open", async () => {
		const steps = lessonRoadmapSteps(tree, transcript as never, new Set(["undo-map", "flattening", "det-test"]));
		assert.equal(roadmapLabel(steps), "The determinant as a test for an inverse");
		await mount(<LessonRoadmap steps={steps} open={false} onOpenChange={() => {}} onJump={() => {}} />);
		assert.match(element('[data-testid="roadmap"]').textContent ?? "", /The determinant as a test for an inverse/);
	});

	it("the panel's Now row names the idea, never a move (the recorded \"Your prediction first\")", async () => {
		const steps = lessonRoadmapSteps(tree, transcript as never, new Set(["undo-map", "flattening", "det-test"]));
		await mount(<LessonRoadmap steps={steps} open onOpenChange={() => {}} onJump={() => {}} />);
		const row = element('[data-testid="roadmap-step-det-test"]');
		assert.match(row.textContent ?? "", /The determinant as a test for an inverse.*Now$/);
		assert.doesNotMatch(document.body.textContent ?? "", /Your prediction first/);
	});

	it("plan_init refuses a title that states a condition in words", () => {
		for (const title of ["Pivots in every column", "Invertible exactly when det is nonzero", "One-to-one only if onto", "Rank never changes under row operations"]) {
			const found = planTitlesGiveAway({ nodes: [{ id: "a", title }] });
			assert.ok(found?.includes(JSON.stringify(title)), `refused: ${title}`);
		}
		assert.equal(planTitlesGiveAway({ nodes: [{ id: "a", title: "What the echelon form needs" }, { id: "b", title: "One-to-one against onto for square matrices" }] }), null);
	});
});

/** Round 9 (lesson reading m10): the panel cut "One-to-one against onto for
 *  square matri…" at its 320px width. A step's title wraps, whole. */
describe("the steps panel shows each title whole (round 9 m10)", () => {
	it("a long title wraps instead of being cut", async () => {
		const steps = roadmapSteps(TREE, ON_PIVOTS, new Set(["kernel", "pivots"]));
		await mount(<LessonRoadmap steps={steps} open onOpenChange={() => {}} onJump={() => {}} />);
		const row = element('[data-testid="roadmap-step-square"] [data-slot="roadmap-step"]');
		const title = [...row.querySelectorAll("span")].find((s) => /One-to-one against onto/.test(s.textContent ?? "") && s.className.includes("flex-1"));
		assert.ok(title, "the title's cell");
		assert.doesNotMatch(title.className, /\btruncate\b/, "never cut with an ellipsis");
		assert.doesNotMatch(row.className, /(^|\s)h-8(\s|$)/, "the row grows to a second line");
	});
});
