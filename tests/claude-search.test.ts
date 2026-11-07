import { after, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLAUDE_SEARCH_DID_NOT_RUN, claudeWebSearch } from "../src/agent/claude-search.ts";
import { CLAUDE_API_KEY_REFUSAL } from "../src/agent/claude-stream.ts";

const dir = mkdtempSync(join(tmpdir(), "lh-fake-claude-search-"));
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
	const systemPrompt = fs.readFileSync(argv[argv.indexOf("--system-prompt-file") + 1], "utf8");
	fs.writeFileSync(out + ".json", JSON.stringify({ argv, env: process.env, stdin, systemPrompt }));
	for (const line of fixture.lines) process.stdout.write(JSON.stringify(line) + "\\n");
	if (fixture.exit !== undefined) process.exit(fixture.exit);
});
setInterval(() => {}, 1000);
`);
chmodSync(fake, 0o755);

const init = { type: "system", subtype: "init", apiKeySource: "none", tools: ["WebSearch"] };
const searchCall = { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "toolu_1", name: "WebSearch", input: { query: "hash tables" } }] } };
const RESULT_TEXT = 'Web search results for query: "hash tables"\n\nLinks: [{"title":"Hash table","url":"https://en.wikipedia.org/wiki/Hash_table"}]\n\nA hash table maps keys to values.';
const searchResult = { type: "user", parent_tool_use_id: null, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: RESULT_TEXT }] } };

let runs = 0;
function scenario(fixture: { lines: unknown[]; exit?: number }) {
	const out = join(dir, `run-${++runs}`);
	const fixturePath = `${out}.fixture.json`;
	writeFileSync(fixturePath, JSON.stringify(fixture));
	const env = { ...process.env, FAKE_CLAUDE_OUT: out, FAKE_CLAUDE_FIXTURE: fixturePath, ANTHROPIC_API_KEY: "sk-ant-parent-key", ANTHROPIC_AUTH_TOKEN: "parent-auth-token" };
	return {
		search: claudeWebSearch({ binary: () => fake, env }),
		recorded: () => JSON.parse(readFileSync(`${out}.json`, "utf8")) as { argv: string[]; env: Record<string, string | undefined>; stdin: string; systemPrompt: string },
		spawned: () => existsSync(`${out}.json`),
		killed: () => existsSync(`${out}.killed`),
	};
}
async function until(check: () => boolean, ms = 3000): Promise<boolean> {
	const end = Date.now() + ms;
	while (Date.now() < end) { if (check()) return true; await new Promise((r) => setTimeout(r, 20)); }
	return check();
}

test("a search returns the first WebSearch result verbatim and kills the relay", async () => {
	const run = scenario({ lines: [init, searchCall, searchResult] });
	assert.equal(await run.search("hash tables"), RESULT_TEXT);
	assert(await until(run.killed), "the relay got SIGTERM after the result");
	const input = JSON.parse(run.recorded().stdin.trim()) as { type: string; message: { content: { type: string; text: string }[] } };
	assert.equal(input.type, "user");
	assert.deepEqual(input.message.content, [{ type: "text", text: "hash tables" }]);
});

test("a result given as text blocks is joined", async () => {
	const blocks = { ...searchResult, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "Links: []" }, { type: "text", text: "Summary." }] }] } };
	const run = scenario({ lines: [init, searchCall, blocks] });
	assert.equal(await run.search("q"), "Links: []\nSummary.");
});

test("the relay runs only WebSearch on Haiku, never --bare, with no credential in its environment", async () => {
	const run = scenario({ lines: [init, searchCall, searchResult] });
	await run.search("hash tables");
	const { argv, env, systemPrompt } = run.recorded();
	const flag = (name: string) => argv[argv.indexOf(name) + 1];
	assert.equal(flag("--tools"), "WebSearch");
	assert.equal(flag("--allowedTools"), "WebSearch");
	assert.equal(flag("--model"), "claude-haiku-5-5");
	assert.equal(flag("--setting-sources"), "");
	assert(!argv.includes("--bare"));
	assert(!argv.includes("--safe-mode"));
	assert(!argv.includes("--mcp-config"), "no app tools ride the relay");
	assert.match(systemPrompt, /Call the WebSearch tool exactly once/);
	assert.equal(env.ANTHROPIC_API_KEY, undefined);
	assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined);
	assert.equal(env.CLAUDE_CODE_DISABLE_THINKING, "1");
});

test("an init reporting an API key is refused and the relay killed", async () => {
	const run = scenario({ lines: [{ ...init, apiKeySource: "ANTHROPIC_API_KEY" }, searchCall, searchResult] });
	await assert.rejects(run.search("q"), { message: CLAUDE_API_KEY_REFUSAL });
	assert(await until(run.killed));
});

test("a rate-limited search reports the plan's usage limit", async () => {
	const run = scenario({ lines: [
		init,
		{ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1_900_000_000 } },
		{ type: "result", subtype: "error_during_execution", is_error: true, result: "" },
	] });
	await assert.rejects(run.search("q"), /usage limit is reached/);
});

test("a successful run that never searched fails with a retry hint", async () => {
	const run = scenario({ lines: [init, { type: "result", subtype: "success", is_error: false, result: "From memory: ..." }] });
	await assert.rejects(run.search("q"), { message: CLAUDE_SEARCH_DID_NOT_RUN });
});

test("a relay that exits before any result fails with curated text", async () => {
	const run = scenario({ lines: [init], exit: 1 });
	await assert.rejects(run.search("q"), /Claude request failed/);
});

test("aborting the search kills the relay", async () => {
	const run = scenario({ lines: [init, searchCall] });
	const controller = new AbortController();
	const pending = run.search("q", controller.signal);
	assert(await until(run.spawned));
	controller.abort();
	await assert.rejects(pending, /stopped before it finished/);
	assert(await until(run.killed), "the relay got SIGTERM on abort");
});

test("a missing claude binary fails without spawning", async () => {
	await assert.rejects(claudeWebSearch({ binary: () => null })("q"), /Claude Code was not found/);
});
