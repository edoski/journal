import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { claudeAccount, refreshClaudeConnections, resetClaudeConnections } from "../src/agent/claude-connection.ts";
import type { LoadedClaudeAccount } from "../src/agent/claude-accounts.ts";
import { claudeEngine } from "../src/agent/models.ts";
import { catalogContextLimits, claudeAccountKnown, modelStatus, providerConnected } from "../src/server/model-catalog.ts";

import { connectionBackgroundAllowed } from "../src/agent/subscription-connections.ts";

const signedIn = JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "learner@example.com", subscriptionType: "max" });
const signedOut = JSON.stringify({ loggedIn: false, authMethod: "none", apiProvider: "firstParty" });
const DEFAULT: LoadedClaudeAccount = { providerId: "claude-subscription", label: "Claude Code", email: null, auth: "default", instanceId: null };
const connect = (stdout: string) => refreshClaudeConnections({ force: true, load: () => [DEFAULT], binary: () => "/fake/claude", run: async () => ({ code: 0, stdout, stderr: "" }) });

beforeEach(() => resetClaudeConnections());

test("the model status and context limits follow whether Claude Code is signed in to the plan", async () => {
	await connect(signedOut);
	assert.equal(providerConnected("claude-subscription"), false);
	assert.equal(catalogContextLimits().has("claude-subscription:claude-opus-5-5"), false);

	await connect(signedIn);
	assert.equal(providerConnected("claude-subscription"), true);
	assert.equal(catalogContextLimits().get("claude-subscription:claude-opus-5-5"), 1_000_000);
	assert.deepEqual(await modelStatus(), { account: "claude-subscription", connected: true, contextWindow: 1_000_000 });
});

test("Claude is an ordinary keyed provider that may work in the background", () => {
	assert.equal(connectionBackgroundAllowed("claude-subscription"), true);
	const engine = claudeEngine("claude-subscription");
	assert.equal(engine.model.provider, "claude-subscription");
	assert.equal(engine.model.id, "claude-opus-5-5");
	assert.equal(engine.model.cost.input + engine.model.cost.output, 0, "no per-token cost on a plan");
	assert.equal(engine.level, "high");
});

test("each account is its own provider, and dispatch runs on the account it names", async () => {
	const accounts: LoadedClaudeAccount[] = [
		{ ...DEFAULT, label: "Main", instanceId: "main" },
		{ providerId: "claude-subscription-work", label: "Work", email: null, auth: "profile", instanceId: "work", configDir: "/fake/.claude-work" },
		{ providerId: "claude-subscription-old", label: "Old", email: null, auth: "profile", instanceId: "old", configDir: "/fake/.claude-old" },
	];
	await refreshClaudeConnections({ force: true, load: () => accounts, binary: () => "/fake/claude", run: async (_bin, _args, env) => ({ code: 0, stdout: env.CLAUDE_CONFIG_DIR === "/fake/.claude-old" ? signedOut : signedIn, stderr: "" }) });
	assert.deepEqual([...catalogContextLimits().keys()], ["claude-subscription:claude-opus-5-5", "claude-subscription-work:claude-opus-5-5"]);
	assert.equal(providerConnected("claude-subscription-work"), true);
	assert.equal(providerConnected("claude-subscription-old"), false);
	assert.equal(claudeAccountKnown("claude-subscription-old"), true, "a signed-out account is still one T3 Code has");
	assert.equal(claudeAccountKnown("claude-subscription-gone"), false);
	const engine = claudeEngine("claude-subscription-work");
	assert.equal(engine.model.provider, "claude-subscription-work");
	assert.equal(engine.model.name, "Claude Opus 5.5 · Work");
	assert.equal(claudeAccount(engine.model.provider)?.label, "Work");
	assert.throws(() => claudeEngine("claude-subscription-gone"), /no claude-opus-5-5 on Claude account claude-subscription-gone/);
});
