import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { subscriptionLabel, subscriptionLabels, isSubscriptionModel, type TurnUsage } from "../src/core/index.ts";
import { sessionCost, callCost } from "../src/server/pricing.ts";
import { graphCostSummary } from "../src/core/cost-summary.ts";
import { planCostLabel } from "../components/usage-format.ts";
import { ModelCommand } from "../components/settings/model-pickers.tsx";
import { toModelDto } from "../src/server/model-catalog.ts";
import { piModels } from "../src/agent/models.ts";
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
test("graph stage/recent aggregates retain distinct subscription providers without inventing dollars", () => {
	const summary = graphCostSummary({ chats: [{ title: "Fixture", extractions: [{ startedAt: 1, at: "2026-10-24T00:00:00Z", durationMs: 1, stages: { extractor: { model: "claude-subscription:claude-haiku-5-5", steps: [step] }, auditor: { model: "chatgpt:gpt-5", steps: [step] } } }] }], sources: [] }, callCost);
	assert.equal(summary.totalDollars, 0); assert.equal(summary.unpricedRuns, 0); assert.equal(summary.runs[0]!.dollars, null);
	assert.deepEqual(summary.subscriptionProviders, ["Claude", "ChatGPT"]); assert.deepEqual(summary.runs[0]!.subscriptionProviders, ["Claude", "ChatGPT"]);
});
test("model picker distinguishes subscription connection and shows provider label rather than API prices", () => {
	const native = piModels().getModels("openai").find((m) => m.api === "openai-responses")!;
	const html = renderToStaticMarkup(<ModelCommand models={[toModelDto({ ...native, provider: "chatgpt" })]} effectiveId={undefined} onPick={() => {}} />);
	assert(html.includes("ChatGPT (subscription)")); assert(html.includes(">ChatGPT</span>")); assert(!html.includes("$0"));
});
