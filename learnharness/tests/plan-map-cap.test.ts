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
import { stepsLayout } from "../components/unit-inbox/topic-page/steps/steps-facts.ts";
import { READABLE_ZOOM, TAG_ROOM, cardFit, framedCamera } from "../components/course-map/topic-map/topic-map-layout.ts";

/** The lesson map's pane at 1512×982 with the sidebar open, measured in the
 *  running app on 17 Nov 2026, and its fade (`PANE_FADE`). */
const PANE = { width: 864, height: 787 };
const FADE = { x: 24, y: 40 };

/** Whether the lesson map opens with every step and the tags over the first row clear of the fade, at a scale its
 *  titles stay readable at: the course map's camera (`framedCamera`), a plan that fits sitting at the pane's top. */
function opensWhole(tree: Pick<PlanTree, "nodes" | "edges">): boolean {
	const { layout } = stepsLayout({ tree: { ...tree, version: 1 }, current: null, visited: [] } as never);
	const camera = framedCamera(layout, null, PANE, FADE, TAG_ROOM, "top");
	if (camera.zoom < READABLE_ZOOM) return false;
	return [...layout.topics.values()].every((at) => {
		const left = at.x * camera.zoom + camera.x;
		const top = (at.y - (at.layer === 0 ? TAG_ROOM : 0)) * camera.zoom + camera.y;
		return cardFit({ left, top, right: left + layout.node.width * camera.zoom, bottom: (at.y + layout.node.height) * camera.zoom + camera.y }, PANE, FADE) === "clear";
	});
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
		assert.deepEqual(PLAN_MAP_CAP, { steps: 12, deep: 8, across: 4 });
		assert.ok(opensWhole(chain(PLAN_MAP_CAP.deep)), "a chain as deep as the cap opens whole");
		assert.ok(!opensWhole(chain(PLAN_MAP_CAP.deep + 1)), "one step deeper does not");
		assert.ok(opensWhole(grid(3, 4)), "twelve steps four across open whole");
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
