import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionLabel, subscriptionLabels, isSubscriptionModel, type TurnUsage } from "../src/core/index.ts";
import { sessionCost, callCost } from "../src/server/pricing.ts";
import { planCostLabel } from "../components/usage-format.ts";
const step = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: undefined, cacheWriteTokens: undefined, reasoningTokens: undefined };
const turn = (model: string, id: string): TurnUsage => ({ id, messageId: id, at: "2026-10-24T00:00:00Z", model, steps: [step] });

test("only explicit subscription route IDs count as subscription use; names stay compact and unique", () => {
	assert.equal(subscriptionLabel("chatgpt:gpt-5"), "ChatGPT");
	assert.equal(subscriptionLabel("claude-subscription:claude-opus-5-5"), "Claude");
	for (const model of ["openai:gpt-5", "xai:grok", "github-copilot-subscription:fixture", "meta:muse", "radius:any", "kimi-coding:any"]) assert(!isSubscriptionModel(model));
	assert.deepEqual(subscriptionLabels(["chatgpt:a", "claude-subscription:b", "chatgpt:c"]), ["ChatGPT", "Claude"]);
	assert.equal(planCostLabel(0.67, ["ChatGPT"], (n) => `$${n.toFixed(2)}`), "$0.67 + ChatGPT");
	assert.equal(planCostLabel(null, ["ChatGPT", "Claude"]), "ChatGPT + Claude");
});
test("mixed session pricing sums only API dollars and retains all subscription providers, not unpriced errors", () => {
	const turns = [turn("claude-subscription:claude-opus-5-5", "claude"), turn("chatgpt:gpt-5", "chatgpt"), turn("openai:gpt-5", "api")];
	const pricing = sessionCost({ turns }); assert.equal(pricing.subscription, 2); assert.equal(pricing.unpriced, 0); assert.equal(pricing.cost, callCost(step, "openai:gpt-5"));
	assert.deepEqual(pricing.subscriptionProviders, ["Claude", "ChatGPT"]);
});
