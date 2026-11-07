import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline";
import { normalizeContext, type AssistantMessageEvent } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { claudeSubscriptionModel, claudeSubscriptionStream, claudeTranscriptBlocks } from "../src/agent/claude-stream.ts";
import { CLAUDE_MCP_SCRIPT, claudeWorkDir, writeClaudeCallFiles } from "../src/agent/claude-cli.ts";
import type { LoadedClaudeAccount } from "../src/agent/claude-accounts.ts";

const dir = mkdtempSync(join(tmpdir(), "lh-fake-claude-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const fake = join(dir, "claude");
writeFileSync(fake, `#!${process.execPath}
const fs = require("node:fs");
const out = process.env.FAKE_CLAUDE_OUT;
const fixture = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_FIXTURE, "utf8"));
process.on("SIGTERM", () => { fs.writeFileSync(out + ".killed", "SIGTERM"); process.exit(143); });
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
	const argv = process.argv.slice(2);
	const read = (flag) => fs.readFileSync(argv[argv.indexOf(flag) + 1], "utf8");
	const mcp = JSON.parse(read("--mcp-config"));
	const tools = JSON.parse(fs.readFileSync(mcp.mcpServers.lh.env.LH_CLAUDE_TOOLS_FILE, "utf8"));
	fs.writeFileSync(out + ".json", JSON.stringify({ argv, env: process.env, stdin, cwd: process.cwd(), systemPrompt: read("--system-prompt-file"), mcp, tools }));
	for (const line of fixture.lines) process.stdout.write(JSON.stringify(line) + "\\n");
	if (fixture.exit !== undefined) { process.stderr.write(fixture.stderr || ""); process.exit(fixture.exit); }
});
setInterval(() => {}, 1000);
`);
chmodSync(fake, 0o755);

const model = claudeSubscriptionModel("claude-subscription", "claude-opus-5-5")!;
const se = (event: unknown) => ({ type: "stream_event", event, parent_tool_use_id: null });
const init = { type: "system", subtype: "init", apiKeySource: "none", mcp_servers: [{ name: "lh", status: "connected" }] };
const toolUseLines = [
	init,
	se({ type: "message_start", message: { id: "msg_1", usage: { input_tokens: 5 } } }),
	se({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "mcp__lh__quiz", input: {} } }),
	se({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"question\":\"Q?\"}" } }),
	se({ type: "content_block_stop", index: 0 }),
	se({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } }),
];

let runs = 0;
function scenario(fixture: { lines: unknown[]; exit?: number; stderr?: string }, account?: LoadedClaudeAccount) {
	const out = join(dir, `run-${++runs}`);
	const fixturePath = `${out}.fixture.json`;
	writeFileSync(fixturePath, JSON.stringify(fixture));
	const env = {
		...process.env,
		FAKE_CLAUDE_OUT: out,
		FAKE_CLAUDE_FIXTURE: fixturePath,
		ANTHROPIC_API_KEY: "sk-ant-parent-key",
		ANTHROPIC_AUTH_TOKEN: "parent-auth-token",
		CLAUDE_CODE_OAUTH_TOKEN: "parent-oauth-token",
		LH_DESKTOP_API_SECRET: "x".repeat(64),
		LH_AUTH_FILE: "/secret/auth.json",
		OPENAI_API_KEY: "sk-openai-parent",
		CLAUDE_CODE_USE_BEDROCK: "1",
		ANTHROPIC_BASE_URL: "https://proxy.example",
		CLAUDE_CODE_OAUTH_REFRESH_TOKEN: "parent-refresh",
		CLAUDE_CONFIG_DIR: "/parent/claude-config",
	};
	const stream = claudeSubscriptionStream({ binary: () => fake, env, account });
	const context = normalizeContext({
		systemPrompt: "You are a tutor.",
		messages: [{ role: "user", content: "Teach me hash tables.", timestamp: 0 }],
		tools: [{ name: "quiz", description: "Pose a question.", parameters: Type.Object({ question: Type.String() }) }],
	});
	return {
		out,
		recorded: () => JSON.parse(readFileSync(`${out}.json`, "utf8")) as { argv: string[]; env: Record<string, string | undefined>; stdin: string; cwd: string; systemPrompt: string; mcp: { mcpServers: { lh: { command: string; args: string[]; env: Record<string, string> } } }; tools: { name: string }[] },
		killed: () => existsSync(`${out}.killed`),
		start: (signal?: AbortSignal, { thinking = true }: { thinking?: boolean } = {}) => ({ events: stream(model, context, { reasoning: thinking ? "high" : undefined, signal }), context }),
	};
}
async function collect(events: AsyncIterable<AssistantMessageEvent>, onEvent?: (event: AssistantMessageEvent) => void): Promise<AssistantMessageEvent[]> {
	const seen: AssistantMessageEvent[] = [];
	for await (const event of events) { seen.push(event); onEvent?.(event); }
	return seen;
}
async function until(check: () => boolean, ms = 3000): Promise<boolean> {
	const end = Date.now() + ms;
	while (Date.now() < end) { if (check()) return true; await new Promise((r) => setTimeout(r, 20)); }
	return check();
}

test("the child gets the user's environment minus every credential and app secret, and never --bare", async () => {
	const run = scenario({ lines: toolUseLines });
	const { events, context } = run.start();
	const seen = await collect(events);
	const done = seen.at(-1)!;
	assert(done.type === "done" && done.reason === "toolUse");
	assert.deepEqual(done.message.content, [{ type: "toolCall", id: "toolu_1", name: "quiz", arguments: { question: "Q?" } }]);

	const { argv, env, stdin, cwd, systemPrompt, mcp, tools } = run.recorded();
	for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_REFRESH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "ANTHROPIC_BASE_URL", "LH_DESKTOP_API_SECRET", "LH_AUTH_FILE", "OPENAI_API_KEY"]) assert.equal(env[name], undefined, `${name} must not reach Claude Code`);
	assert.equal(env.HOME, process.env.HOME, "the user's own environment is kept");
	assert.equal(env.PATH, [dir, process.env.PATH].join(delimiter), "the binary's own directory leads PATH");
	assert.equal(env.ENABLE_TOOL_SEARCH, "false");
	assert.equal(env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK, "1");
	assert.equal(env.CLAUDE_CODE_DISABLE_THINKING, undefined, "thinking stays on at a set effort");
	assert(!argv.includes("--bare"));
	assert(!argv.includes("--safe-mode"));
	assert(!argv.some((arg) => /sk-ant|oauth-token|auth-token/.test(arg)), "no credential rides argv");
	const flag = (name: string) => argv[argv.indexOf(name) + 1];
	assert.equal(flag("--model"), "claude-opus-5-5");
	assert.equal(flag("--effort"), "high");
	assert.equal(systemPrompt, "You are a tutor.");
	assert(!argv.includes("--system-prompt"), "the prompt goes by file");
	assert.equal(flag("--tools"), "");
	assert.equal(flag("--setting-sources"), "");
	assert.equal(flag("--allowedTools"), "mcp__lh");
	for (const fixed of ["-p", "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands", "--include-partial-messages", "--verbose"]) assert(argv.includes(fixed), fixed);
	assert.equal(mcp.mcpServers.lh.command, process.execPath);
	assert.equal(mcp.mcpServers.lh.args[0], "-e");
	assert.equal(mcp.mcpServers.lh.env.ELECTRON_RUN_AS_NODE, "1");
	assert.deepEqual(tools.map((t) => t.name), ["quiz"]);
	assert(await until(() => !existsSync(flag("--mcp-config")!)), "the call's files are removed once the child exits");
	assert.notEqual(cwd, process.cwd(), "Claude Code runs in a neutral directory, not the repo");
	const input = JSON.parse(stdin.trim()) as { type: string; message: { role: string; content: unknown } };
	assert.equal(input.type, "user");
	assert.deepEqual(input.message.content, claudeTranscriptBlocks(context.messages));
});

const CREDENTIALS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_REFRESH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "ANTHROPIC_BASE_URL", "LH_DESKTOP_API_SECRET", "OPENAI_API_KEY"];

test("a token account's child gets only that account's token and a private config dir", async () => {
	const account: LoadedClaudeAccount = { providerId: "claude-subscription-work", label: "Work", email: null, auth: "token", instanceId: "work", token: () => "fake-setup-token-work" };
	const run = scenario({ lines: toolUseLines }, account);
	await collect(run.start().events);
	const { argv, env } = run.recorded();
	assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, "fake-setup-token-work");
	for (const name of CREDENTIALS) assert.equal(env[name], undefined, `${name} must not reach Claude Code`);
	const dir = env.CLAUDE_CONFIG_DIR!;
	assert(dir.startsWith(join(claudeWorkDir(), "accounts")), "a private config dir under the app's Claude work dir");
	assert.equal(statSync(dir).mode & 0o777, 0o700);
	assert(!argv.includes("--bare"));
	assert(!argv.some((arg) => arg.includes("fake-setup-token")), "the token never rides argv");
});

test("a profile account's child gets its own config dir and no token; the T3 default home drops the inherited dir", async () => {
	const profile = scenario({ lines: toolUseLines }, { providerId: "claude-subscription-home", label: "Home", email: null, auth: "profile", instanceId: "home", configDir: "/fake/.claude-home" });
	await collect(profile.start().events);
	assert.equal(profile.recorded().env.CLAUDE_CONFIG_DIR, "/fake/.claude-home");
	assert.equal(profile.recorded().env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
	for (const name of CREDENTIALS) assert.equal(profile.recorded().env[name], undefined, name);
	assert(!profile.recorded().argv.includes("--bare"));

	const home = scenario({ lines: toolUseLines }, { providerId: "claude-subscription", label: "Main", email: null, auth: "default", instanceId: "main" });
	await collect(home.start().events);
	assert.equal(home.recorded().env.CLAUDE_CONFIG_DIR, undefined, "the default home, whatever the parent set");
	assert.equal(home.recorded().env.CLAUDE_CODE_OAUTH_TOKEN, undefined);

	const plain = scenario({ lines: toolUseLines });
	await collect(plain.start().events);
	assert.equal(plain.recorded().env.CLAUDE_CONFIG_DIR, "/parent/claude-config", "the synthetic default runs exactly like a terminal `claude`");
});

test("a token that cannot be read fails the turn without starting Claude Code", async () => {
	const run = scenario({ lines: toolUseLines }, { providerId: "claude-subscription-work", label: "Work", email: null, auth: "token", instanceId: "work", token: () => { throw new Error("LearnHarness could not read T3 Code's setup token for Work."); } });
	const seen = await collect(run.start().events);
	assert.equal(seen.length, 1);
	assert(seen[0]!.type === "error");
	assert.match(seen[0]!.error.errorMessage!, /setup token for Work.*No API key was used\.$/);
	assert(!existsSync(`${run.out}.json`), "no child ran");
});

test("thinking off disables Claude Code's thinking", async () => {
	const run = scenario({ lines: toolUseLines });
	await collect(run.start(undefined, { thinking: false }).events);
	const { argv, env } = run.recorded();
	assert(!argv.includes("--effort"));
	assert.equal(env.CLAUDE_CODE_DISABLE_THINKING, "1");
});

test("a turn whose tool server did not connect fails instead of running without tools", async () => {
	const run = scenario({ lines: [{ ...init, mcp_servers: [{ name: "lh", status: "failed" }] }, ...toolUseLines.slice(1)] });
	const seen = await collect(run.start().events);
	assert.equal(seen.length, 1);
	assert(seen[0]!.type === "error");
	assert.match(seen[0]!.error.errorMessage!, /could not load LearnHarness's tools/);
});

test("a tool call that arrives only as a snapshot fails instead of waiting on the tool server", async () => {
	const run = scenario({ lines: [init, { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "toolu_1", name: "mcp__lh__quiz", input: {} }] } }] });
	const seen = await collect(run.start().events);
	const last = seen.at(-1)!;
	assert(last.type === "error");
	assert(await until(run.killed));
});

test("Claude Code is killed as soon as the model stops for a tool call", async () => {
	const run = scenario({ lines: toolUseLines });
	await collect(run.start().events);
	assert(await until(run.killed), "the child got SIGTERM after tool_use");
});

test("aborting the request kills Claude Code and reports aborted", async () => {
	const run = scenario({ lines: [init, se({ type: "message_start", message: { usage: { input_tokens: 1 } } }), se({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })] });
	const controller = new AbortController();
	const seen = await collect(run.start(controller.signal).events, (event) => { if (event.type === "text_start") controller.abort(); });
	const last = seen.at(-1)!;
	assert(last.type === "error" && last.reason === "aborted");
	assert(await until(run.killed), "the child got SIGTERM on abort");
});

test("an init reporting an API key kills Claude Code before any output", async () => {
	const run = scenario({ lines: [{ ...init, apiKeySource: "ANTHROPIC_API_KEY" }, ...toolUseLines.slice(1)] });
	const seen = await collect(run.start().events);
	assert.equal(seen.length, 1);
	assert(seen[0]!.type === "error");
	assert(await until(run.killed));
});

test("a child that exits without a result fails the turn with its stderr tail", async () => {
	const run = scenario({ lines: [init], exit: 2, stderr: "Error: unexpected thing\n" });
	const seen = await collect(run.start().events);
	const last = seen.at(-1)!;
	assert(last.type === "error");
	assert.match(last.error.errorMessage!, /exited with code 2.*unexpected thing/);
});

test("a missing claude binary fails the turn without spawning", async () => {
	const stream = claudeSubscriptionStream({ binary: () => null });
	const seen = await collect(stream(model, normalizeContext({ messages: [] })));
	assert.equal(seen.length, 1);
	assert(seen[0]!.type === "error");
	assert.match(seen[0]!.error.errorMessage!, /Claude Code was not found/);
});

test("the declaration server lists the app's tools and never answers a tool call", async () => {
	const tools = [{ name: "quiz", description: "Pose a question.", inputSchema: { type: "object", properties: { question: { type: "string" } } } }];
	const files = writeClaudeCallFiles("prompt", tools);
	after(files.dispose);
	const server = (JSON.parse(readFileSync(files.mcpConfigFile, "utf8")) as { mcpServers: { lh: { args: string[]; env: Record<string, string> } } }).mcpServers.lh;
	assert.equal(server.args[1], CLAUDE_MCP_SCRIPT);
	const child = spawn(process.execPath, server.args, { env: { ...process.env, ...server.env }, stdio: ["pipe", "pipe", "inherit"] });
	const replies: { id: number; result: Record<string, unknown> }[] = [];
	createInterface({ input: child.stdout }).on("line", (line) => replies.push(JSON.parse(line)));
	const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
	send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
	send({ jsonrpc: "2.0", method: "notifications/initialized" });
	send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
	send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "quiz", arguments: { question: "Q?" } } });
	send({ jsonrpc: "2.0", id: 4, method: "ping" });
	assert(await until(() => replies.length >= 3));
	await new Promise((r) => setTimeout(r, 200));
	child.kill();
	assert.deepEqual(replies.map((r) => r.id), [1, 2, 4], "no reply to tools/call");
	assert.equal((replies[0]!.result.serverInfo as { name: string }).name, "lh");
	assert.deepEqual(replies[1]!.result.tools, tools);
});
