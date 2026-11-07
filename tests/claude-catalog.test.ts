import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { refreshClaudeConnection, resetClaudeConnection } from "../src/agent/claude-connection.ts";
import { piEngineForSpec } from "../src/agent/models.ts";
import { catalogContextLimits, catalogProviders, modelCatalog, validateModelsSettings } from "../src/server/model-catalog.ts";
import { providerKeyPresent } from "../src/server/keys.ts";
import { isSubscriptionProvider } from "../src/agent/subscription-connections.ts";

const signedIn = JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "learner@example.com", subscriptionType: "max" });
const signedOut = JSON.stringify({ loggedIn: false, authMethod: "none", apiProvider: "firstParty" });
const connect = (stdout: string) => refreshClaudeConnection({ force: true, binary: () => "/fake/claude", run: async () => ({ code: 0, stdout, stderr: "" }) });
const claudeSlots = { strong: { model: { provider: "claude-subscription", id: "claude-opus-5-5" } } };

beforeEach(() => resetClaudeConnection());

test("Claude models join the picker, context limits and slot validation only while Claude Code is signed in to the plan", async () => {
	await connect(signedOut);
	assert.equal(providerKeyPresent("claude-subscription"), false);
	assert.equal(catalogProviders().find((p) => p.id === "claude-subscription")?.keyPresent, false);
	assert(!modelCatalog().models.some((m) => m.provider === "claude-subscription"));
	assert.equal(validateModelsSettings(claudeSlots).ok, false);

	await connect(signedIn);
	assert.equal(providerKeyPresent("claude-subscription"), true);
	assert.equal(catalogProviders().find((p) => p.id === "claude-subscription")?.keyPresent, true);
	const claude = modelCatalog().models.filter((m) => m.provider === "claude-subscription");
	assert.deepEqual(claude.map((m) => m.id), ["claude-opus-5-5"], "only Opus 5.5 is listed");
	assert(claude.every((m) => m.cost.input === 0 && m.cost.output === 0));
	assert.equal(catalogContextLimits().get("claude-subscription:claude-opus-5-5"), 1_000_000);
	assert.deepEqual(validateModelsSettings(claudeSlots), { ok: true });
});

test("Claude is an ordinary keyed provider, not an app-held subscription credential", () => {
	assert.equal(isSubscriptionProvider("claude-subscription"), false);
	const engine = piEngineForSpec({ provider: "claude-subscription", id: "claude-opus-5-5", thinkingLevel: "minimal" });
	assert.equal(engine.model.provider, "claude-subscription");
	assert.equal(engine.level, "low", "pi's clamp uses the cloned thinking map");
});
