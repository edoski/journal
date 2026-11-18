/**
 * Round 16, m23 (1 m8): the Eigen lesson's step map drew "Finding every
 * eigenvector for one eigenvalue" above "Eigenvalues of a 2×2 matrix by
 * hand", the reverse of how it was taught, and taught steps wore the same
 * grey dot as steps ahead. The plan said `compute` rests on `eigenspace`,
 * and the tutor marked `compute` done before teaching `eigenspace`: the
 * map draws each step below what it rests on, so the plan's needs must
 * follow the taught order. `lesson_progress` refuses a step marked done
 * ahead of a step it rests on, and the map draws a done step with a check.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LESSON_PROGRESS_TOOL, type PlanTree } from "../src/core/contracts.ts";
import { doneBeforeNeeds, planTools } from "../src/agent/tools/plan.ts";
import { sessionPlanOf } from "../src/server/topic.ts";
import { stepMarks } from "../components/unit-inbox/topic-page/steps/steps-facts.ts";
import { CardContent } from "../components/course-map/topic-map/canvas/canvas-node.tsx";
import type { LhMessage } from "../src/core/native-messages.ts";

const node = (id: string, title: string) => ({ id, title, status: "upcoming" as const });
const TREE = {
	nodes: [node("maps", "What a matrix does to a vector"), node("equation", "The equation an eigenvector satisfies"), node("charpoly", "Where the determinant comes in"), node("eigenspace", "Finding every eigenvector for one eigenvalue"), node("compute", "Eigenvalues of a $2 \\times 2$ matrix by hand")],
	edges: [
		{ from: "maps", to: "equation" },
		{ from: "equation", to: "charpoly" },
		{ from: "equation", to: "eigenspace" },
		{ from: "charpoly", to: "compute" },
		{ from: "eigenspace", to: "compute" },
	],
	version: 1,
} as unknown as PlanTree;
const progress = (id: string, done: string[]): LhMessage => ({ id: `a-${id}`, role: "assistant", content: [{ type: "toolCall", id, name: LESSON_PROGRESS_TOOL, arguments: { done } }], timestamp: 1 }) as unknown as LhMessage;
const SO_FAR = [progress("p1", ["maps", "equation", "charpoly"])];

describe("a step is marked done only after what it rests on (round 16, m23)", () => {
	it("finds a step marked done ahead of a step it rests on", () => {
		assert.deepEqual(doneBeforeNeeds(TREE, SO_FAR, ["compute"]), [{ step: "compute", needs: ["eigenspace"] }]);
		assert.deepEqual(doneBeforeNeeds(TREE, SO_FAR, ["eigenspace", "compute"]), [], "both in one call: taught in order");
		assert.deepEqual(doneBeforeNeeds(TREE, [], ["maps"]), [], "a first step rests on nothing");
	});

	it("refuses it, telling the tutor to rest the map on the order it taught", async () => {
		const tool = planTools({ chatId: "c1", chatStore: { getChat: () => ({ tree: TREE, messages: SO_FAR }) } as never })[LESSON_PROGRESS_TOOL]!;
		const refused = JSON.stringify((await tool.execute("t1", { done: ["compute"] })).content);
		assert.match(refused, /compute rests on eigenspace/);
		assert.match(refused, /plan_init/);
		assert.doesNotMatch(JSON.stringify((await tool.execute("t2", { done: ["eigenspace"] })).content), /rests on/);
	});
});

describe("a done step wears a check on the topic page's map (round 16, m23)", () => {
	it("carries the steps marked done into the page's plan and marks", () => {
		const plan = sessionPlanOf({ id: "c1", tree: TREE, messages: SO_FAR } as never)!;
		assert.deepEqual(plan.done, ["maps", "equation", "charpoly"]);
		const marks = stepMarks(plan, false);
		assert.equal(marks.get("charpoly")?.done, true);
		assert.equal(marks.get("eigenspace")?.done, false);
	});

	it("draws a check, never the dot a step ahead wears", () => {
		const card = (done: boolean) => renderToStaticMarkup(<CardContent data={{ kind: "step", handle: "charpoly", title: "Where the determinant comes in", status: "visited", done, current: false, tag: null, label: "", needs: null, summary: null, href: "/chat/c1" } as never} />);
		assert.match(card(true), /data-done="true"[^>]*><svg/);
		assert.doesNotMatch(card(false), /<svg/);
	});
});
