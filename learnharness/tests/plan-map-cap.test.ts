/**
 * A lesson's plan map fits one screen of his lesson map (PLAN_MAP_CAP,
 * Edo's ruling of 14 Nov 2026): the cap's numbers are what the topic
 * page's lesson map shows whole at his window, and plan_init refuses a
 * bigger map with what to prune or split.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLAN_MAP_CAP, type PlanTree } from "../src/core/contracts/plan.ts";
import { planDepth, planMapTooBig } from "../src/core/plan-tree.ts";
import { planTools } from "../src/agent/tools/plan.ts";
import { stepsLayout, STEP_SIZE, TAG_ROOM } from "../components/unit-inbox/topic-page/steps/steps-facts.ts";
import { LAYER_GAP, NODE_GAP, WHOLE_COURSE_ZOOM } from "../components/course-map/topic-map/topic-map-layout.ts";

/** The lesson map's pane at 1512×982 with the sidebar open, measured in the
 *  running app on 14 Nov 2026, and its fade (lesson-map.tsx's FADE). */
const PANE = { width: 696, height: 786 };
const FADE = { x: 24, y: 40 };

/** The scale the pane opens a plan whole at (steps-facts.ts's fitZoom). */
function fit(tree: Pick<PlanTree, "nodes" | "edges">): number {
	const { layout } = stepsLayout({ tree: { ...tree, version: 1 }, current: null, visited: [] } as never);
	return Math.min(1, (PANE.width - FADE.x * 2) / layout.width, (PANE.height - FADE.y * 2) / (layout.height + TAG_ROOM));
}

function chain(n: number): Pick<PlanTree, "nodes" | "edges"> {
	const nodes = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: `Step ${i}` }));
	return { nodes, edges: nodes.slice(1).map((node, i) => ({ from: `s${i}`, to: node.id })) };
}

/** `wide` steps side by side over each of `rows` rows, each resting on the
 *  one above it. */
function grid(rows: number, wide: number): Pick<PlanTree, "nodes" | "edges"> {
	const nodes = Array.from({ length: rows * wide }, (_, i) => ({ id: `s${i}`, title: `Step ${i}` }));
	const edges = nodes.slice(wide).map((node, i) => ({ from: `s${i}`, to: node.id }));
	return { nodes, edges };
}

describe("PLAN_MAP_CAP", () => {
	it("is what the lesson map's pane shows whole at his window, at the scale its titles stay readable", () => {
		const across = Math.floor(((PANE.width - FADE.x * 2) / WHOLE_COURSE_ZOOM + NODE_GAP) / (STEP_SIZE.width + NODE_GAP));
		const rows = Math.floor(((PANE.height - FADE.y * 2) / WHOLE_COURSE_ZOOM - TAG_ROOM + LAYER_GAP) / (STEP_SIZE.height + LAYER_GAP));
		assert.deepEqual([rows, across], [8, 4]);
		assert.equal(PLAN_MAP_CAP.deep, rows);
		assert.equal(PLAN_MAP_CAP.across, across, "a card is sized for four across (stepCard)");
		assert.ok(PLAN_MAP_CAP.steps <= rows * across);
		assert.ok(fit(chain(PLAN_MAP_CAP.deep)) >= WHOLE_COURSE_ZOOM, "a chain as deep as the cap opens whole");
		assert.ok(fit(chain(PLAN_MAP_CAP.deep + 1)) < WHOLE_COURSE_ZOOM, "one step deeper does not");
		assert.ok(fit(grid(3, 4)) >= WHOLE_COURSE_ZOOM, "twelve steps four across open whole");
	});

	it("counts a plan's depth as its longest chain of steps", () => {
		assert.equal(planDepth(chain(5)), 5);
		assert.equal(planDepth(grid(3, 4)), 3);
		assert.equal(planDepth({ nodes: [], edges: [] }), 0);
	});

	it("says what is over and what to do about it", () => {
		assert.equal(planMapTooBig(chain(PLAN_MAP_CAP.deep)), null);
		assert.equal(planMapTooBig(grid(3, 4)), null);
		const long = planMapTooBig(chain(PLAN_MAP_CAP.deep + 1));
		assert.match(long ?? "", /a chain 9 steps long where 8 fit/);
		assert.match(long ?? "", /Prune steps he already holds/);
		assert.match(long ?? "", /split the lesson/);
		assert.match(planMapTooBig(grid(4, 4)) ?? "", /16 steps where 12 fit/);
	});
});

describe("plan_init", () => {
	function tool() {
		const saved: PlanTree[] = [];
		const store = { getChat: () => ({ messages: [] }), saveTree: (_id: string, tree: PlanTree) => saved.push(tree), nameSession: () => {} };
		return { saved, plan: planTools({ chatId: "c1", chatStore: store as never }).plan_init! };
	}
	const mermaid = (n: number) => ["graph TD", ...Array.from({ length: n - 1 }, (_, i) => `  s${i}[Step ${i}] --> s${i + 1}[Step ${i + 1}]`)].join("\n");

	it("refuses a map bigger than one screen and saves nothing", async () => {
		const { saved, plan } = tool();
		const res = await plan.execute("t1", { mermaid: mermaid(PLAN_MAP_CAP.deep + 1) });
		assert.match(JSON.stringify(res.content), /does not fit his lesson map on one screen/);
		assert.equal(saved.length, 0);
	});

	it("saves a map that fits", async () => {
		const { saved, plan } = tool();
		const res = await plan.execute("t1", { mermaid: mermaid(PLAN_MAP_CAP.deep) });
		assert.match((res.content[0] as { text: string }).text, /"ok":true/);
		assert.equal(saved[0]?.nodes.length, PLAN_MAP_CAP.deep);
	});

	it("tells the tutor the cap and that nothing waits for his approval", () => {
		const { plan } = tool();
		assert.ok(plan.description.includes(`at most ${PLAN_MAP_CAP.steps} steps, no chain longer than ${PLAN_MAP_CAP.deep}`));
		assert.match(plan.description, /needs to approve nothing/);
	});
});
