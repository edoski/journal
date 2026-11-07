import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { claudeConnected, claudeConnection, parseClaudeAuthStatus, refreshClaudeConnection, resetClaudeConnection, type ClaudeRunner } from "../src/agent/claude-connection.ts";
import { resolveClaudeBinary } from "../src/agent/claude-cli.ts";
import { isProviderKeyRefusal, providerKeyMissing } from "../src/core/settings.ts";

beforeEach(() => resetClaudeConnection());

const status = (fields: Record<string, unknown>) => JSON.stringify({ analyticsDisabled: false, projectsDirectory: "/x", configDirectory: "/y", ...fields });

test("a claude.ai sign-in on Anthropic's API is a plan connection", () => {
	assert.deepEqual(parseClaudeAuthStatus(status({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "learner@example.com", subscriptionType: "max" })), { state: "connected", email: "learner@example.com", plan: "max" });
	assert.deepEqual(parseClaudeAuthStatus(status({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" })), { state: "connected", email: null, plan: null });
});

test("signed out, API-key and cloud-provider sign-ins are not plan connections", () => {
	assert.deepEqual(parseClaudeAuthStatus(status({ loggedIn: false, authMethod: "none", apiProvider: "firstParty" })), { state: "signed-out" });
	assert.deepEqual(parseClaudeAuthStatus(status({ loggedIn: true, authMethod: "api_key", apiProvider: "firstParty", apiKeySource: "/login managed key" })), { state: "not-subscription", authMethod: "api_key" });
	assert.deepEqual(parseClaudeAuthStatus(status({ loggedIn: true, authMethod: "third_party", apiProvider: "bedrock" })), { state: "not-subscription", authMethod: "bedrock" });
});

test("unreadable status output is an error, not a guess", () => {
	for (const output of ["", "Not logged in. Run claude auth login", "[]", "null"]) {
		const parsed = parseClaudeAuthStatus(output);
		assert.equal(parsed.state, "error", JSON.stringify(output));
	}
});

test("a missing binary reports missing without running anything", async () => {
	let ran = false;
	const connection = await refreshClaudeConnection({ binary: () => null, run: async () => { ran = true; return { code: 0, stdout: "", stderr: "" }; } });
	assert.deepEqual(connection, { state: "missing" });
	assert.equal(ran, false);
	assert.equal(claudeConnected(), false);
});

test("the status check uses the turn's environment, caches briefly and re-checks when forced", async () => {
	const calls: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
	let output = status({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "a@b.c", subscriptionType: "pro" });
	const run: ClaudeRunner = async (_binary, args, env) => { calls.push({ args, env }); return { code: 0, stdout: output, stderr: "" }; };
	let clock = 0;
	const deps = { run, binary: () => "/fake/claude", now: () => clock, env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-should-vanish", CLAUDE_CODE_OAUTH_TOKEN: "t", ANTHROPIC_AUTH_TOKEN: "t", LH_DESKTOP_API_SECRET: "s" } };
	assert.equal(claudeConnection(), null);
	assert.equal((await refreshClaudeConnection(deps)).state, "connected");
	assert.deepEqual(calls[0]!.args, ["auth", "status", "--json"]);
	for (const name of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN", "LH_DESKTOP_API_SECRET"]) assert.equal(calls[0]!.env[name], undefined, name);
	assert.equal(calls[0]!.env.PATH, "/bin");
	assert.equal(claudeConnected(), true);
	clock = 10_000;
	await refreshClaudeConnection(deps);
	assert.equal(calls.length, 1, "within the cache window");
	output = status({ loggedIn: false, authMethod: "none", apiProvider: "firstParty" });
	await refreshClaudeConnection({ ...deps, force: true });
	assert.equal(calls.length, 2);
	assert.deepEqual(claudeConnection(), { state: "signed-out" });
	assert.equal(claudeConnected(), false);
	output = status({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" });
	clock = 50_000;
	await refreshClaudeConnection(deps);
	assert.equal(calls.length, 3, "after the cache window");
	assert.equal(claudeConnected(), true);
});

test("concurrent checks share one run, and a run that fails to start is an error state", async () => {
	let runs = 0;
	const run: ClaudeRunner = async () => { runs++; await new Promise((r) => setTimeout(r, 10)); return { code: null, stdout: "", stderr: "", error: new Error("spawn ENOENT") }; };
	const [a, b] = await Promise.all([refreshClaudeConnection({ run, binary: () => "/fake/claude", force: true }), refreshClaudeConnection({ run, binary: () => "/fake/claude", force: true })]);
	assert.equal(runs, 1);
	assert.equal(a.state, "error");
	assert.deepEqual(a, b);
});

test("the binary is found on PATH first, then in the usual install locations", () => {
	const seen: string[] = [];
	const found = resolveClaudeBinary({ env: { PATH: "/custom/bin:relative/bin" }, home: "/Users/me", executable: (path) => { seen.push(path); return path === "/opt/homebrew/bin/claude"; } });
	assert.equal(found, "/opt/homebrew/bin/claude");
	assert.deepEqual(seen, ["/custom/bin/claude", "/Users/me/.local/bin/claude", "/opt/homebrew/bin/claude"]);
	assert.equal(resolveClaudeBinary({ env: {}, home: "/Users/me", executable: () => false }), null);
	assert.equal(resolveClaudeBinary({ env: { PATH: "/a" }, home: "/h", executable: (path) => path === "/a/claude" }), "/a/claude");
});

test("a turn refused for Claude points at Claude Code's own sign-in, not at a key", () => {
	const envelope = providerKeyMissing("claude-subscription", ["strong"]);
	assert.match(envelope.error, /run `claude` in a terminal, sign in with your Claude account/);
	assert(!/Settings → Keys/.test(envelope.error));
	assert(isProviderKeyRefusal(envelope.error));
});

test("the Claude integration never touches a Claude credential: no token flows, no keychain, no reads of Claude's files", async () => {
	const { readFileSync } = await import("node:fs");
	const files = ["src/agent/claude-cli.ts", "src/agent/claude-connection.ts", "src/agent/claude-stream.ts", "src/server/claude-connection-http.ts", "components/settings/claude-connection.tsx", "src/core/contracts/claude.ts"];
	for (const file of files) {
		const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
		for (const forbidden of [/setup-token/, /keychain/i, /find-generic-password/, /\.credentials/, /readFile/, /auth login/, /"--bare"/]) {
			assert(!forbidden.test(source), `${file} must not contain ${forbidden}`);
		}
		const tokenMentions = source.match(/CLAUDE_CODE_OAUTH_TOKEN/g) ?? [];
		assert(tokenMentions.length === 0 || (file === "src/agent/claude-cli.ts" && tokenMentions.length === 1), `${file}: the OAuth token name appears only in the denylist`);
	}
});
