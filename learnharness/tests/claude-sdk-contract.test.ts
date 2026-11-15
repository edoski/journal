import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { claudeChildEnv, claudeWorkDir } from "../src/agent/claude-cli.ts";
import type { LoadedClaudeAccount } from "../src/agent/claude-accounts.ts";
import { claudeModelMissing, resetClaudeUsage } from "../src/agent/claude-usage.ts";
import { SdkAgent } from "../src/agent/sdk/agent.ts";
import { claudeSdkLaunch, claudeSdkOptions, claudeSubscriptionModel, type SdkEngine, type SdkLaunch } from "../src/agent/sdk/engine.ts";

const BINARY = "/fake/bin/claude";
const model = claudeSubscriptionModel("claude-subscription")!;

const PARENT_ENV = {
	...process.env,
	ANTHROPIC_API_KEY: "sk-ant-parent-key",
	ANTHROPIC_AUTH_TOKEN: "parent-auth-token",
	CLAUDE_CODE_OAUTH_TOKEN: "parent-oauth-token",
	LH_DESKTOP_API_SECRET: "x".repeat(64),
	LH_CREDENTIALS_DIR: "/secret",
	OPENAI_API_KEY: "sk-openai-parent",
	GROQ_API_KEY: "gsk-parent",
	ANTHROPIC_CUSTOM_HEADERS: "x-api-key: parent",
	GITHUB_AUTH_TOKEN: "parent-gh",
	CLAUDE_CODE_USE_BEDROCK: "1",
	ANTHROPIC_BASE_URL: "https://proxy.example",
	CLAUDE_CODE_OAUTH_REFRESH_TOKEN: "parent-refresh",
	CLAUDE_CONFIG_DIR: "/parent/claude-config",
};
const CREDENTIALS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_REFRESH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "ANTHROPIC_BASE_URL", "LH_DESKTOP_API_SECRET", "OPENAI_API_KEY"];

const tokenAccount = (token: () => string): LoadedClaudeAccount => ({ providerId: "claude-subscription-work", label: "Work", email: null, auth: "token", instanceId: "work", token });

/** An engine whose query plays fixed SDK messages and records whether it ran. */
function scripted(lines: unknown[], launch: () => SdkLaunch = () => ({ options: {}, configDir: mkdtempSync(join(tmpdir(), "lh-contract-")) })) {
	const ran = { count: 0 };
	const engine: SdkEngine = {
		model,
		launch,
		query: () => {
			ran.count++;
			const iterator = (async function* () { for (const line of lines) yield line as SDKMessage; })();
			return { [Symbol.asyncIterator]: () => iterator, interrupt: async () => undefined, close: () => void iterator.return(undefined) };
		},
	};
	return { engine, ran };
}

async function turn(engine: SdkEngine): Promise<AgentMessage[]> {
	const agent = new SdkAgent({ engine, systemPrompt: "You are a tutor.", tools: [], messages: [{ id: "u1", role: "user", content: "Teach me hash tables.", timestamp: 0 } as AgentMessage], endsTurn: () => false });
	await agent.continue();
	return agent.state.messages.slice(1);
}
const failureOf = (messages: AgentMessage[]) => {
	const last = messages.at(-1) as AssistantMessage | undefined;
	assert.equal(last?.stopReason, "error");
	return last!.errorMessage!;
};

const init = (connected = true) => ({ type: "system", subtype: "init", session_id: "s1", apiKeySource: "none", mcp_servers: connected ? [{ name: "lh", status: "connected" }] : [{ name: "lh", status: "failed" }] });
const se = (event: unknown) => ({ type: "stream_event", event, parent_tool_use_id: null });
const textReply = [
	se({ type: "message_start", message: { id: "msg_1", usage: { input_tokens: 5 } } }),
	se({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
	se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi." } }),
	se({ type: "content_block_stop", index: 0 }),
	se({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }),
	se({ type: "message_stop" }),
	{ type: "assistant", parent_tool_use_id: null, message: { content: [] }, uuid: "a1" },
	{ type: "result", subtype: "success", is_error: false, result: "", session_id: "s1" },
];

test("the child gets the user's environment minus every credential and app secret, and never --bare", () => {
	const options = claudeSdkOptions(BINARY, undefined, PARENT_ENV);
	const env = options.env!;
	for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_REFRESH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "ANTHROPIC_BASE_URL", "LH_DESKTOP_API_SECRET", "LH_CREDENTIALS_DIR", "OPENAI_API_KEY", "GROQ_API_KEY", "ANTHROPIC_CUSTOM_HEADERS", "GITHUB_AUTH_TOKEN"]) assert.equal(env[name], undefined, `${name} must not reach Claude Code`);
	assert.equal(env.HOME, process.env.HOME, "the user's own environment is kept");
	assert.equal(env.PATH, ["/fake/bin", process.env.PATH].join(delimiter), "the binary's own directory leads PATH");
	assert.equal(env.ENABLE_TOOL_SEARCH, "false");
	assert.equal(env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK, "1");
	assert.equal(env.CLAUDE_CODE_DISABLE_THINKING, undefined, "thinking stays on at a set effort");
	assert.equal(env.CLAUDE_CONFIG_DIR, "/parent/claude-config", "the synthetic default runs exactly like a terminal `claude`");
	// Round 6: a turn ending on send_to_user and no plain text read to Claude
	// Code as one with no visible output, so it asked the model to answer
	// again, and the paragraph printed twice.
	assert.deepEqual(env.CLAUDE_CODE_TERMINAL_MCP_TOOLS?.split(","), ["mcp__lh__send_to_user"], "send_to_user is the turn's visible output");

	assert.equal(options.pathToClaudeCodeExecutable, BINARY);
	assert.equal(options.model, "claude-opus-5-5");
	assert.equal(options.effort, "high");
	assert.deepEqual(options.settingSources, [], "none of the user's settings");
	assert.equal(options.strictMcpConfig, true, "none of the user's MCP servers");
	assert.equal(options.permissionMode, "dontAsk");
	const args = Object.keys(options.extraArgs ?? {});
	assert(!args.includes("bare") && !args.includes("safe-mode"), "never --bare");
	assert(!JSON.stringify(options.extraArgs ?? {}).match(/sk-ant|oauth-token|auth-token/), "no credential rides argv");
	assert.notEqual(options.cwd, process.cwd(), "Claude Code runs in a neutral directory, not the repo");
});

test("thinking off disables Claude Code's thinking (the usage probe)", () => {
	assert.equal(claudeChildEnv(PARENT_ENV, { binary: BINARY, thinking: false }).CLAUDE_CODE_DISABLE_THINKING, "1");
});

test("a token account's child gets only that account's token and a private config dir", () => {
	const launch = claudeSdkLaunch(tokenAccount(() => "fake-setup-token-work"), { binary: BINARY, env: PARENT_ENV });
	const env = launch.options.env!;
	assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, "fake-setup-token-work");
	for (const name of CREDENTIALS) assert.equal(env[name], undefined, `${name} must not reach Claude Code`);
	const dir = env.CLAUDE_CONFIG_DIR!;
	assert(dir.startsWith(join(claudeWorkDir(), "accounts")), "a private config dir under the app's Claude work dir");
	assert.equal(statSync(dir).mode & 0o777, 0o700);
	assert.equal(launch.configDir, dir, "the account's sessions live in its own config dir");
	assert(!JSON.stringify(launch.options.extraArgs ?? {}).includes("fake-setup-token"), "the token never rides argv");
});

test("a profile account's child gets its own config dir and no token; the T3 default home drops the inherited dir", () => {
	const profile = claudeSdkLaunch({ providerId: "claude-subscription-home", label: "Home", email: null, auth: "profile", instanceId: "home", configDir: "/fake/.claude-home" }, { binary: BINARY, env: PARENT_ENV });
	assert.equal(profile.options.env!.CLAUDE_CONFIG_DIR, "/fake/.claude-home");
	assert.equal(profile.options.env!.CLAUDE_CODE_OAUTH_TOKEN, undefined);
	for (const name of CREDENTIALS) assert.equal(profile.options.env![name], undefined, name);
	assert.equal(profile.configDir, "/fake/.claude-home");

	const home = claudeSdkLaunch({ providerId: "claude-subscription", label: "Main", email: null, auth: "default", instanceId: "main" }, { binary: BINARY, env: PARENT_ENV });
	assert.equal(home.options.env!.CLAUDE_CONFIG_DIR, undefined, "the default home, whatever the parent set");
	assert.equal(home.options.env!.CLAUDE_CODE_OAUTH_TOKEN, undefined);
});

test("a token that cannot be read fails the turn without starting Claude Code", async () => {
	const account = tokenAccount(() => { throw new Error("LearnHarness could not read T3 Code's setup token for Work."); });
	assert.throws(() => claudeSdkLaunch(account, { binary: BINARY, env: PARENT_ENV }), /setup token for Work.*No API key was used\.$/);
	const { engine, ran } = scripted(textReply, () => claudeSdkLaunch(account, { binary: BINARY, env: PARENT_ENV }));
	const messages = await turn(engine);
	assert.equal(messages.length, 1);
	assert.match(failureOf(messages), /setup token for Work.*No API key was used\.$/);
	assert.equal(ran.count, 0, "no Claude Code ran");
});

test("a provider whose account is gone fails instead of running on another login", () => {
	assert.throws(() => claudeSdkLaunch("missing", { binary: BINARY, env: PARENT_ENV }), /no longer set up/);
});

test("a missing claude binary fails before starting anything", () => {
	assert.throws(() => claudeSdkLaunch(undefined, { binary: null, env: PARENT_ENV }), /Claude Code was not found/);
});

test("a turn whose tool server did not connect fails instead of running without tools", async () => {
	const { engine } = scripted([init(false), ...textReply]);
	const messages = await turn(engine);
	assert.equal(messages.length, 1, "no reply reached the record");
	assert.match(failureOf(messages), /could not load LearnHarness's tools/);
});

test("Claude Code that ends without a result fails the turn", async () => {
	const { engine } = scripted([init()]);
	assert.match(failureOf(await turn(engine)), /ended before finishing the reply/);
});

test("an account whose plan lacks Opus 5.5 is marked for Settings until one of its calls finishes", async () => {
	resetClaudeUsage();
	const missing = scripted([
		init(),
		{ type: "assistant", parent_tool_use_id: null, message: { content: [] }, api_error_status: 404, uuid: "a0" },
		{ type: "result", subtype: "error_during_execution", is_error: true, errors: ["There's an issue with the selected model"], session_id: "s1" },
	]);
	assert.match(failureOf(await turn(missing.engine)), /not available on this Claude plan/);
	assert.equal(claudeModelMissing(model.provider), true);
	const ok = scripted([init(), ...textReply]);
	const messages = await turn(ok.engine);
	assert.equal((messages.at(-1) as AssistantMessage).stopReason, "stop");
	assert.equal(claudeModelMissing(model.provider), false, "a finished reply clears the mark");
});
