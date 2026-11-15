import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionLabel, subscriptionLabels, isSubscriptionModel, type TurnUsage } from "../src/core/index.ts";
import { sessionCost, callCost, turnCost, jobCost } from "../src/server/pricing.ts";
import { planCostLabel } from "../components/usage-format.ts";
const step = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: undefined, cacheWriteTokens: undefined, reasoningTokens: undefined };
const turn = (model: string, id: string, steps = [step]): TurnUsage => ({ id, messageId: id, at: "2026-10-24T00:00:00Z", model, steps });

test("only the Claude plan's route IDs count as subscription use; names stay compact and unique", () => {
	assert.equal(subscriptionLabel("claude-subscription:claude-opus-5-5"), "Claude");
	for (const model of ["openai:gpt-5", "xai:grok", "github-copilot-subscription:fixture", "meta:muse", "radius:any", "kimi-coding:any"]) assert(!isSubscriptionModel(model));
	assert.deepEqual(subscriptionLabels(["claude-subscription:a", "openai:b", "claude-subscription-work:c"]), ["Claude"]);
	assert.equal(planCostLabel(0.67, ["Claude"], (n) => `$${n.toFixed(2)}`), "$0.67 + Claude");
	assert.equal(planCostLabel(null, ["Claude", "Claude"]), "Claude");
	assert.equal(planCostLabel(null, undefined), "—");
});

test("plan usage is neither API dollars nor an unpriced-model mistake, including empty usage", () => {
	const plan = turn("claude-subscription:claude-opus-5-5", "plan");
	assert.equal(callCost(step, plan.model), null);
	assert.equal(turnCost(turn(plan.model, "empty", [])), null);
	assert.equal(jobCost({ usage: { model: plan.model, ...step, steps: 1 } }), null);
	assert.deepEqual(sessionCost({ turns: [plan] }), { cost: 0, unpriced: 0, subscription: 1, subscriptionProviders: ["Claude"], turnCosts: { plan: null } });
});

test("mixed session pricing sums only API dollars and keeps the plan, not unpriced errors", () => {
	const turns = [turn("claude-subscription:claude-opus-5-5", "claude"), turn("openai:gpt-5", "api"), turn("unknown:missing", "unknown")];
	const pricing = sessionCost({ turns }); assert.equal(pricing.subscription, 1); assert.equal(pricing.unpriced, 1); assert.equal(pricing.cost, callCost(step, "openai:gpt-5"));
	assert.deepEqual(pricing.subscriptionProviders, ["Claude"]);
	assert.match(planCostLabel(pricing.cost, pricing.subscriptionProviders), /\$[\d.]+ \+ Claude$/);
});
