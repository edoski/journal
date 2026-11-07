import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { normalizeContext, type AssistantMessageEvent } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { claudeSubscriptionModel, claudeSubscriptionStream, claudeTranscriptBlocks } from "../src/agent/claude-stream.ts";
import { CLAUDE_MCP_SCRIPT, claudeMcpEnv } from "../src/agent/claude-cli.ts";

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
	fs.writeFileSync(out + ".json", JSON.stringify({ argv: process.argv.slice(2), env: process.env, stdin, cwd: process.cwd() }));
	for (const line of fixture.lines) process.stdout.write(JSON.stringify(line) + "\\n");
	if (fixture.exit !== undefined) { process.stderr.write(fixture.stderr || ""); process.exit(fixture.exit); }
});
setInterval(() => {}, 1000);
`);
chmodSync(fake, 0o755);

const model = claudeSubscriptionModel("claude-opus-5-5")!;
const se = (event: unknown) => ({ type: "stream_event", event, parent_tool_use_id: null });
const init = { type: "system", subtype: "init", apiKeySource: "none" };
const toolUseLines = [
	init,
	se({ type: "message_start", message: { id: "msg_1", usage: { input_tokens: 5 } } }),
	se({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "mcp__lh__quiz", input: {} } }),
	se({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"question\":\"Q?\"}" } }),
	se({ type: "content_block_stop", index: 0 }),
	se({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } }),
];

let runs = 0;
function scenario(fixture: { lines: unknown[]; exit?: number; stderr?: string }) {
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
	};
	const stream = claudeSubscriptionStream({ binary: () => fake, env });
	const context = normalizeContext({
		systemPrompt: "You are a tutor.",
		messages: [{ role: "user", content: "Teach me hash tables.", timestamp: 0 }],
		tools: [{ name: "quiz", description: "Pose a question.", parameters: Type.Object({ question: Type.String() }) }],
	});
	return {
		out,
		recorded: () => JSON.parse(readFileSync(`${out}.json`, "utf8")) as { argv: string[]; env: Record<string, string | undefined>; stdin: string; cwd: string },
		killed: () => existsSync(`${out}.killed`),
		start: (signal?: AbortSignal) => ({ events: stream(model, context, { reasoning: "high", signal }), context }),
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

	const { argv, env, stdin, cwd } = run.recorded();
	for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "LH_DESKTOP_API_SECRET"]) assert.equal(env[name], undefined, `${name} must not reach Claude Code`);
	assert.equal(env.PATH, process.env.PATH, "the user's own environment is kept");
	assert.equal(env.ENABLE_TOOL_SEARCH, "false");
	assert(!argv.includes("--bare"));
	assert(!argv.includes("--safe-mode"));
	assert(!argv.some((arg) => /sk-ant|oauth-token|auth-token/.test(arg)), "no credential rides argv");
	const flag = (name: string) => argv[argv.indexOf(name) + 1];
	assert.equal(flag("--model"), "claude-opus-5-5");
	assert.equal(flag("--effort"), "high");
	assert.equal(flag("--system-prompt"), "You are a tutor.");
	assert.equal(flag("--tools"), "");
	assert.equal(flag("--setting-sources"), "");
	assert.equal(flag("--allowedTools"), "mcp__lh");
	for (const fixed of ["-p", "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands", "--include-partial-messages", "--verbose"]) assert(argv.includes(fixed), fixed);
	const mcp = JSON.parse(flag("--mcp-config")!) as { mcpServers: { lh: { command: string; args: string[]; env: Record<string, string> } } };
	assert.equal(mcp.mcpServers.lh.command, process.execPath);
	assert.equal(mcp.mcpServers.lh.args[0], "-e");
	assert.equal(mcp.mcpServers.lh.env.ELECTRON_RUN_AS_NODE, "1");
	assert.deepEqual(JSON.parse(mcp.mcpServers.lh.env.LH_CLAUDE_TOOLS!).map((t: { name: string }) => t.name), ["quiz"]);
	assert.notEqual(cwd, process.cwd(), "Claude Code runs in a neutral directory, not the repo");
	const input = JSON.parse(stdin.trim()) as { type: string; message: { role: string; content: unknown } };
	assert.equal(input.type, "user");
	assert.deepEqual(input.message.content, claudeTranscriptBlocks(context.messages));
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
	const child = spawn(process.execPath, ["-e", CLAUDE_MCP_SCRIPT], { env: { ...process.env, ...claudeMcpEnv(tools) }, stdio: ["pipe", "pipe", "inherit"] });
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
