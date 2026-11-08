import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeLaunch, loadClaudeAccounts, publicClaudeAccount, type LoadedClaudeAccount } from "../src/agent/claude-accounts.ts";
import { claudeChildEnv } from "../src/agent/claude-cli.ts";
import { resetClaudeConnections, type ClaudeRunner } from "../src/agent/claude-connection.ts";
import { resetClaudeUsage } from "../src/agent/claude-usage.ts";
import { claudeAccountStatuses } from "../src/server/claude-connection-http.ts";

const root = mkdtempSync(join(tmpdir(), "lh-claude-accounts-"));
after(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => { resetClaudeConnections(); resetClaudeUsage(); });

const b64url = (text: string) => Buffer.from(text).toString("base64url");
let homes = 0;

/** A fake home with a fake T3 Code install: settings, setup-token secrets and per-dir .claude.json files. */
function fakeHome({ instances, secrets = {}, emails = {}, settings }: { instances?: Record<string, unknown>; secrets?: Record<string, string>; emails?: Record<string, string>; settings?: string }) {
	const home = join(root, `home-${++homes}`);
	mkdirSync(join(home, ".t3", "userdata", "secrets"), { recursive: true });
	if (settings !== undefined || instances) writeFileSync(join(home, ".t3", "userdata", "settings.json"), settings ?? JSON.stringify({ providerInstances: instances }));
	for (const [id, token] of Object.entries(secrets)) writeFileSync(join(home, ".t3", "userdata", "secrets", `provider-env-${b64url(id)}-${b64url("CLAUDE_CODE_OAUTH_TOKEN")}.bin`), token);
	for (const [dir, email] of Object.entries(emails)) {
		const file = dir === "" ? join(home, ".claude.json") : join(home, dir, ".claude.json");
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(file, JSON.stringify({ oauthAccount: { emailAddress: email } }));
	}
	return home;
}
const tokenEnv = [{ name: "CLAUDE_CODE_OAUTH_TOKEN", sensitive: true, valueRedacted: true }];

const FOUR = {
	claudeAgent: { driver: "claudeAgent", enabled: true, displayName: "Main", environment: tokenEnv },
	claude_2: { driver: "claudeAgent", enabled: true, displayName: "Second", config: { homePath: "~/.claude-2" }, environment: tokenEnv },
	claude_off: { driver: "claudeAgent", enabled: false, displayName: "Off", config: { homePath: "~/.claude-off" } },
	codex: { driver: "codex", enabled: true, displayName: "Codex" },
	claude_d: { driver: "claudeAgent", enabled: true, config: { homePath: "~/.claude-4" }, environment: [] },
};

test("enabled claudeAgent instances become accounts; the default home keeps the original provider id", () => {
	const home = fakeHome({ instances: FOUR, secrets: { claudeAgent: "fake-token-main\n", claude_2: "fake-token-second" }, emails: { "": "main@example.com", ".claude-2": "second@example.com" } });
	const accounts = loadClaudeAccounts({ home });
	assert.deepEqual(accounts.map(publicClaudeAccount), [
		{ providerId: "claude-subscription", label: "Main", email: "main@example.com", auth: "token" },
		{ providerId: "claude-subscription-claude_2", label: "Second", email: "second@example.com", auth: "token" },
		{ providerId: "claude-subscription-claude_d", label: "claude_d", email: null, auth: "profile" },
	]);
	const [main, second, profile] = accounts as [LoadedClaudeAccount & { auth: "token" }, LoadedClaudeAccount & { auth: "token" }, LoadedClaudeAccount & { auth: "profile" }];
	assert.equal(main.token(), "fake-token-main", "the token is read trimmed, at call time");
	assert.equal(second.token(), "fake-token-second");
	assert.equal(profile.configDir, join(home, ".claude-4"), "~ expands to the home");
});

test("an absolute homePath equal to ~/.claude is the default home too, and a profile there runs without a config dir", () => {
	const home = fakeHome({ instances: { primary: { driver: "claudeAgent", enabled: true, displayName: "Primary", config: { homePath: "" } } } });
	assert.deepEqual(loadClaudeAccounts({ home }).map(publicClaudeAccount), [{ providerId: "claude-subscription", label: "Primary", email: null, auth: "default" }]);
	const absolute = fakeHome({ instances: {} });
	writeFileSync(join(absolute, ".t3", "userdata", "settings.json"), JSON.stringify({ providerInstances: { x: { driver: "claudeAgent", enabled: true, config: { homePath: join(absolute, ".claude") } } } }));
	const [only] = loadClaudeAccounts({ home: absolute });
	assert.equal(only!.providerId, "claude-subscription");
	assert.deepEqual(claudeLaunch(only!, root), { configDir: undefined }, "T3's default home ignores any inherited CLAUDE_CONFIG_DIR");
});

test("without T3 Code, with unreadable settings, or with no default-home account, a synthetic default account stands in", () => {
	const synthetic = { providerId: "claude-subscription", label: "Claude Code", email: "me@example.com", auth: "default" };
	const missing = fakeHome({ emails: { "": "me@example.com" } });
	assert.deepEqual(loadClaudeAccounts({ home: missing }).map(publicClaudeAccount), [synthetic]);
	const broken = fakeHome({ settings: "{not json", emails: { "": "me@example.com" } });
	assert.deepEqual(loadClaudeAccounts({ home: broken }).map(publicClaudeAccount), [synthetic]);
	const noDefault = fakeHome({ instances: { claude_2: FOUR.claude_2 }, emails: { "": "me@example.com" } });
	assert.deepEqual(loadClaudeAccounts({ home: noDefault }).map((a) => a.providerId), ["claude-subscription", "claude-subscription-claude_2"]);
	const [plain] = loadClaudeAccounts({ home: missing });
	assert.equal(claudeLaunch(plain!, root), undefined, "the synthetic default inherits the environment untouched");
});

test("a missing or empty token file reads as an error naming the account, never as an empty token", () => {
	const home = fakeHome({ instances: { claude_2: FOUR.claude_2 }, secrets: { claude_2: "  \n" } });
	const [, second] = loadClaudeAccounts({ home });
	assert.throws(() => claudeLaunch(second!, root), /setup token for Second/);
	const none = fakeHome({ instances: { claude_2: FOUR.claude_2 } });
	assert.throws(() => claudeLaunch(loadClaudeAccounts({ home: none })[1]!, root), /setup token for Second/);
});

test("child environments: each account's own credential only, never a parent's", () => {
	const home = fakeHome({ instances: FOUR, secrets: { claudeAgent: "fake-token-main", claude_2: "fake-token-second" } });
	const parent = { PATH: "/bin", HOME: "/Users/learner", CLAUDE_CODE_OAUTH_TOKEN: "parent-token", ANTHROPIC_API_KEY: "parent-api-key", CLAUDE_CONFIG_DIR: "/parent/dir" };
	const envs = loadClaudeAccounts({ home }).map((account) => claudeChildEnv(parent, { launch: claudeLaunch(account, root) }));
	assert.equal(envs[0]!.CLAUDE_CODE_OAUTH_TOKEN, "fake-token-main");
	assert.equal(envs[1]!.CLAUDE_CODE_OAUTH_TOKEN, "fake-token-second");
	assert.equal(envs[2]!.CLAUDE_CODE_OAUTH_TOKEN, undefined, "a profile account carries no token");
	assert.equal(envs[2]!.CLAUDE_CONFIG_DIR, join(home, ".claude-4"));
	assert.notEqual(envs[0]!.CLAUDE_CONFIG_DIR, envs[1]!.CLAUDE_CONFIG_DIR, "each token account has its own private config dir");
	for (const env of envs) {
		assert.equal(env.ANTHROPIC_API_KEY, undefined);
		assert.notEqual(env.CLAUDE_CODE_OAUTH_TOKEN, "parent-token");
		assert.notEqual(env.CLAUDE_CONFIG_DIR, "/parent/dir");
		assert.equal(env.HOME, "/Users/learner");
	}
});

test("the route payload lists every account with no token, path or secret in it", async () => {
	const home = fakeHome({ instances: FOUR, secrets: { claudeAgent: "fake-token-main", claude_2: "fake-token-second" }, emails: { "": "main@example.com" } });
	const run: ClaudeRunner = async (_bin, args) => args[0] === "auth"
		? { code: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" }
		: { code: 0, stdout: `${JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed", unifiedWindows: { seven_day: { utilization: 0.38, resetsAt: 1_800_000_000, status: "allowed" } } } })}\n`, stderr: "" };
	const statuses = await claudeAccountStatuses({ force: true, load: () => loadClaudeAccounts({ home }), run, binary: () => "/fake/claude", now: () => 1_000 });
	assert.deepEqual(statuses.map((s) => [s.account.providerId, s.connection.state, s.usage?.percentLeft]), [
		["claude-subscription", "connected", 62],
		["claude-subscription-claude_2", "connected", 62],
		["claude-subscription-claude_d", "connected", 62],
	]);
	const payload = JSON.stringify({ accounts: statuses });
	for (const secret of ["fake-token-main", "fake-token-second", home, "configDir", "\"token\":"]) assert(!payload.includes(secret), `payload must not contain ${secret}`);
});
