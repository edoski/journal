import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { claudeAccount, refreshClaudeConnections, resetClaudeConnections } from "../src/agent/claude-connection.ts";
import type { LoadedClaudeAccount } from "../src/agent/claude-accounts.ts";
import { piEngineForSpec } from "../src/agent/models.ts";
import { catalogContextLimits, catalogProviders, modelCatalog, validateModelsSettings } from "../src/server/model-catalog.ts";
import { providerKeyPresent } from "../src/server/keys.ts";
import { isSubscriptionProvider } from "../src/agent/subscription-connections.ts";

const signedIn = JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "learner@example.com", subscriptionType: "max" });
const signedOut = JSON.stringify({ loggedIn: false, authMethod: "none", apiProvider: "firstParty" });
const DEFAULT: LoadedClaudeAccount = { providerId: "claude-subscription", label: "Claude Code", email: null, auth: "default", instanceId: null };
const connect = (stdout: string) => refreshClaudeConnections({ force: true, load: () => [DEFAULT], binary: () => "/fake/claude", run: async () => ({ code: 0, stdout, stderr: "" }) });
const claudeSlots = { strong: { model: { provider: "claude-subscription", id: "claude-opus-5-5" } } };

beforeEach(() => resetClaudeConnections());

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

test("each signed-in account is its own provider: one Opus 5.5 each, and dispatch runs on the account it names", async () => {
	const accounts: LoadedClaudeAccount[] = [
		{ ...DEFAULT, label: "Main", instanceId: "main" },
		{ providerId: "claude-subscription-work", label: "Work", email: null, auth: "profile", instanceId: "work", configDir: "/fake/.claude-work" },
		{ providerId: "claude-subscription-old", label: "Old", email: null, auth: "profile", instanceId: "old", configDir: "/fake/.claude-old" },
	];
	await refreshClaudeConnections({ force: true, load: () => accounts, binary: () => "/fake/claude", run: async (_bin, _args, env) => ({ code: 0, stdout: env.CLAUDE_CONFIG_DIR === "/fake/.claude-old" ? signedOut : signedIn, stderr: "" }) });
	const claude = modelCatalog().models.filter((m) => m.provider.startsWith("claude-subscription"));
	assert.deepEqual(claude.map((m) => [m.provider, m.id, m.name]), [
		["claude-subscription", "claude-opus-5-5", "Claude Opus 5.5 · Main"],
		["claude-subscription-work", "claude-opus-5-5", "Claude Opus 5.5 · Work"],
	]);
	assert.deepEqual(catalogProviders().filter((p) => p.id.startsWith("claude-subscription")).map((p) => [p.id, p.keyPresent]), [["claude-subscription", true], ["claude-subscription-old", false], ["claude-subscription-work", true]]);
	assert.equal(providerKeyPresent("claude-subscription-work"), true);
	assert.equal(providerKeyPresent("claude-subscription-old"), false);
	assert.deepEqual(validateModelsSettings({ strong: { model: { provider: "claude-subscription-work", id: "claude-opus-5-5" } } }), { ok: true });
	assert.equal(validateModelsSettings({ strong: { model: { provider: "claude-subscription-old", id: "claude-opus-5-5" } } }).ok, false);
	const engine = piEngineForSpec({ provider: "claude-subscription-work", id: "claude-opus-5-5", thinkingLevel: "high" });
	assert.equal(engine.model.provider, "claude-subscription-work");
	assert.equal(claudeAccount(engine.model.provider)?.label, "Work");
	assert.throws(() => piEngineForSpec({ provider: "claude-subscription-gone", id: "claude-opus-5-5" }), /no model/);
});
