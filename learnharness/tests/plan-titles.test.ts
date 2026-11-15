/**
 * The roadmap shows every step's title before the step is taught, so a
 * title names what the step teaches and never states its result (round 6,
 * lesson reading M2: "P(no event) = e^{−λ}" sat over the question asking
 * for it). plan_init refuses a title that states a relation.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanTree } from "../src/core/contracts/plan.ts";
import { planStepIsTheTopic, planTitlesGiveAway } from "../src/core/plan-tree.ts";
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

/** Round 8 (lesson reading M2, m8): the probe-to-teaching turn spent 46 s on
 *  three plan_init attempts, a quoted title with brackets the parser refused
 *  and titles the planning guidance itself modelled; and the Invertible map
 *  ended on a step named after the lesson. */
describe("plan_init passes on the first try when the tutor follows its guidance (round 8)", () => {
	const store = (title?: string) => {
		const saved: PlanTree[] = [];
		return { saved, chatStore: { getChat: () => ({ messages: [], title }), saveTree: (_id: string, tree: PlanTree) => saved.push(tree), nameSession: () => {} } };
	};

	it("reads a quoted title that holds square brackets", async () => {
		const { saved, chatStore } = store();
		const tool = planTools({ chatId: "c1", chatStore: chatStore as never }).plan_init!;
		const res = await tool.execute("t1", { mermaid: 'graph TD\n  columns[Finding the inverse one column at a time]\n  row-reduce["Row reducing $[A \\mid I]$"]\n  columns --> row-reduce' });
		assert.equal(saved.length, 1, JSON.stringify(res.content));
		assert.equal(saved[0]!.nodes.find((n) => n.id === "row-reduce")?.title, "Row reducing $[A \\mid I]$");
	});

	it("refuses a step named after the lesson's topic, with every other problem in the same reply", async () => {
		const { saved, chatStore } = store("Invertible matrices");
		const tool = planTools({ chatId: "c1", chatStore: chatStore as never }).plan_init!;
		const res = await tool.execute("t1", {
			goal: { title: "Invertible matrices", topic: "invertibility" },
			mermaid: "graph TD\n  undo[When a map can be undone] --> det-link[$\\det A \\neq 0$ and collapsed dimensions] --> invertibility[Invertible matrices: test and compute]",
		});
		const text = JSON.stringify(res.content);
		assert.match(text, /Invertible matrices: test and compute/);
		assert.match(text, /collapsed dimensions/);
		assert.equal(saved.length, 0);
	});

	it("takes a step whose title only starts with the lesson's words, which names a part of it", () => {
		const nodes = (title: string) => ({ nodes: [{ id: "limit", title }] }) as unknown as Pick<PlanTree, "nodes">;
		const lesson = { titles: ["Poisson distribution"] };
		assert.equal(planStepIsTheTopic(nodes("Poisson distribution as a limit of the binomial"), lesson), null);
		assert.match(planStepIsTheTopic(nodes("Poisson distribution — test and compute"), lesson) ?? "", /the lesson itself/);
		assert.match(planStepIsTheTopic(nodes("Poisson distribution"), lesson) ?? "", /the lesson itself/);
	});

	it("every example title in the planning guidance and the tool's description parses and passes", async () => {
		const fs = await import("node:fs");
		const guidance = fs.readFileSync(new URL("../src/agent/prompts/teacher/10-planning.md", import.meta.url), "utf8");
		const description = planTools({ chatId: "c1", chatStore: store().chatStore as never }).plan_init!.description;
		const examples = [...`${guidance}\n${description}`.matchAll(/`([a-z0-9-]+(?:\[[^`]*\]|\("[^`]*"\)))`/g)].map((m) => m[1]!.replace(/\\"/g, '"'));
		assert.ok(examples.length >= 4, `found ${examples.join(" | ")}`);
		const { parseMermaidPlan } = await import("../src/agent/tools/mermaid-plan.ts");
		for (const example of examples) {
			const parsed = parseMermaidPlan(`graph TD\n  ${example}`);
			assert.ok(parsed.ok, `${example}: ${parsed.problems.join("; ")}`);
			assert.equal(planTitlesGiveAway(parsed.plan!), null, example);
		}
	});
});
