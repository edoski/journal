import { test } from "node:test";
import assert from "node:assert/strict";
import { callCost, sessionCost, turnCost, jobCost } from "../src/server/pricing.ts";
import type { TurnUsage } from "../src/core/contracts.ts";
import { planCostLabel } from "../components/usage-format.ts";
const step = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: undefined, cacheWriteTokens: undefined, reasoningTokens: undefined };
const turn = (model: string, steps = [step]): TurnUsage => ({ id: "scratch-turn", messageId: "scratch-message", at: "2026-10-19T00:00:00Z", model, steps });

test("subscription usage is neither API dollars nor an unpriced-model mistake, including empty/partial usage", () => {
	const plan = turn("chatgpt:gpt-5");
	assert.equal(callCost(step, plan.model), null);
	assert.equal(turnCost(turn(plan.model, [])), null);
	assert.equal(jobCost({ usage: { model: plan.model, ...step, steps: 1 } }), null);
	assert.deepEqual(sessionCost({ turns: [plan, turn(plan.model, [])] }), { cost: 0, unpriced: 0, subscription: 2, subscriptionProviders: ["ChatGPT"], turnCosts: { "scratch-turn": null } });
	const api = turn("openai:gpt-5");
	const mixed = sessionCost({ turns: [plan, api, turn("unknown:missing")] });
	assert.equal(mixed.cost, turnCost(api)); assert.equal(mixed.unpriced, 1); assert.equal(mixed.subscription, 1);
	assert.equal(planCostLabel(null, true), "ChatGPT");
	assert.match(planCostLabel(mixed.cost, true), /\$[\d.]+ \+ ChatGPT$/);
});
