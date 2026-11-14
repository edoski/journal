/**
 * The roadmap shows every step's title before the step is taught, so a
 * title names what the step teaches and never states its result (round 6,
 * lesson reading M2: "P(no event) = e^{−λ}" sat over the question asking
 * for it). plan_init refuses a title that states a relation.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanTree } from "../src/core/contracts/plan.ts";
import { planTitlesGiveAway } from "../src/core/plan-tree.ts";
import { planTools } from "../src/agent/tools/plan.ts";

const plan = (...titles: string[]): Pick<PlanTree, "nodes"> => ({ nodes: titles.map((title, i) => ({ id: `s${i}`, title })) });

describe("planTitlesGiveAway", () => {
	it("names each title that states a result, and why", () => {
		for (const title of [
			"P(no event) = e^{−λ}",
			"(1 − λ/n)ⁿ → e^{−λ}",
			"λ = rate × length",
			"Σxᵏ/k! = eˣ",
			"$\\lim_{n \\to \\infty} (1 - \\lambda/n)^n$",
			"$X_n \\sim \\mathrm{Bin}(n, \\lambda/n)$",
			"det A ≠ 0 ⟺ A invertible",
			"$\\operatorname{rank} A \\le n$",
		]) {
			const found = planTitlesGiveAway(plan("The no-event case", title));
			assert.ok(found?.includes(JSON.stringify(title)), `refused: ${title}`);
			assert.match(found ?? "", /names what the step teaches/);
		}
	});

	it("passes titles that name an idea, maths included", () => {
		assert.equal(planTitlesGiveAway(plan(
			"The no-event case",
			"Slots shrink to a limit",
			"Eigenvalues of a $2 \\times 2$",
			"Computing $A^{-1}$ with $[A \\mid I]$",
			"Rank by pivots, not pairwise checks",
			"Poisson as a limit of $\\mathrm{Bin}(n, \\lambda/n)$",
		)), null);
	});
});

describe("plan_init refuses a title that gives a result away", () => {
	it("saves nothing and says which title", async () => {
		const saved: PlanTree[] = [];
		const store = { getChat: () => ({ messages: [] }), saveTree: (_id: string, tree: PlanTree) => saved.push(tree), nameSession: () => {} };
		const tool = planTools({ chatId: "c1", chatStore: store as never }).plan_init!;
		const res = await tool.execute("t1", { mermaid: "graph TD\n  slots[Slots shrink] --> none[P(no event) = e^{-λ}]" });
		assert.match(JSON.stringify(res.content), /P\(no event\) = e\^\{-λ\}/);
		assert.equal(saved.length, 0);
	});
});
