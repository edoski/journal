import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import type { LoadedClaudeAccount } from "../src/agent/claude-accounts.ts";
import type { ClaudeRunner } from "../src/agent/claude-connection.ts";
import { CLAUDE_USAGE_FRESH_MS, claudeUsage, claudeUsageFromRateLimit, parseClaudeProbe, recordClaudeRateLimit, refreshClaudeUsage, resetClaudeUsage } from "../src/agent/claude-usage.ts";
import { nextClaudeAccount, soonestClaudeReset, type ClaudeAccountStatus, type ClaudeConnection, type ClaudeUsage } from "../src/core/contracts/claude.ts";

afterEach(() => resetClaudeUsage());

const RESET = 1_800_000_000;
const week = (utilization: number, status = "allowed") => ({ status, unifiedWindows: { seven_day: { utilization, resetsAt: RESET, status } } });
const line = (event: unknown) => `${JSON.stringify(event)}\n`;

test("a rate-limit event becomes the weekly percent left, its reset and whether the account is limited", () => {
	assert.deepEqual(claudeUsageFromRateLimit(week(0.38), 5), { percentLeft: 62, resetsAt: RESET, limited: false, checkedAt: 5 });
	assert.deepEqual(claudeUsageFromRateLimit(week(1.2, "rejected"), 5), { percentLeft: 0, resetsAt: RESET, limited: true, checkedAt: 5 });
	assert.deepEqual(claudeUsageFromRateLimit({ status: "rejected", resetsAt: 1_700_000_000, rateLimitType: "five_hour", unifiedWindows: { seven_day: { utilization: 0.5, resetsAt: RESET } } }, 5), { percentLeft: 50, resetsAt: 1_700_000_000, limited: true, checkedAt: 5 }, "while limited, the reset is when the account works again");
	const previous: ClaudeUsage = { percentLeft: 40, resetsAt: RESET, limited: false, checkedAt: 1 };
	assert.deepEqual(claudeUsageFromRateLimit({ status: "rejected", resetsAt: 1_700_000_000 }, 5, previous), { percentLeft: 40, resetsAt: 1_700_000_000, limited: true, checkedAt: 5 });
	assert.equal(claudeUsageFromRateLimit({ status: "allowed" }, 5), null, "no weekly reading, nothing to record");
	assert.equal(claudeUsageFromRateLimit("nope", 5), null);
});

test("a real call's rate-limit event is recorded for the account that made it", () => {
	recordClaudeRateLimit("claude-subscription-work", week(0.25), 10);
	assert.equal(claudeUsage("claude-subscription-work")?.percentLeft, 75);
	assert.equal(claudeUsage("claude-subscription"), null);
});

test("the probe reads the stream's rate-limit event and is discarded if Claude Code reports an API key", () => {
	const init = { type: "system", subtype: "init", apiKeySource: "none" };
	assert.equal(parseClaudeProbe(line(init) + "garbage\n" + line({ type: "rate_limit_event", rate_limit_info: week(0.9) }) + line({ type: "result", subtype: "success" }), 7)?.percentLeft, 10);
	assert.equal(parseClaudeProbe(line({ ...init, apiKeySource: "ANTHROPIC_API_KEY" }) + line({ type: "rate_limit_event", rate_limit_info: week(0.9) }), 7), null);
	assert.equal(parseClaudeProbe(line(init) + line({ type: "result", is_error: true, result: "Not logged in" }), 7), null);
});

const accounts: LoadedClaudeAccount[] = [
	{ providerId: "claude-subscription", label: "Main", email: null, auth: "default", instanceId: null },
	{ providerId: "claude-subscription-work", label: "Work", email: null, auth: "profile", instanceId: "work", configDir: "/fake/.claude-work" },
];

test("probes are a tiny Haiku call per account, skipped while a reading is under five minutes old unless forced", async () => {
	const calls: { args: string[]; dir: string | undefined }[] = [];
	let utilization = 0.2;
	const run: ClaudeRunner = async (_bin, args, env) => { calls.push({ args, dir: env.CLAUDE_CONFIG_DIR }); return { code: 0, stdout: line({ type: "rate_limit_event", rate_limit_info: week(utilization) }), stderr: "" }; };
	let clock = 1_000;
	const deps = { run, binary: () => "/fake/claude", now: () => clock, env: {} };
	await refreshClaudeUsage(accounts, deps);
	assert.equal(calls.length, 2);
	const flag = (name: string) => calls[0]!.args[calls[0]!.args.indexOf(name) + 1];
	assert.equal(flag("--model"), "claude-haiku-5-5");
	assert.equal(flag("-p"), "hi");
	assert(!calls[0]!.args.includes("--bare"));
	assert.deepEqual(calls.map((c) => c.dir).sort(), [undefined, "/fake/.claude-work"].sort());
	assert.equal(claudeUsage("claude-subscription-work")?.percentLeft, 80);

	clock += CLAUDE_USAGE_FRESH_MS - 1;
	await refreshClaudeUsage(accounts, deps);
	assert.equal(calls.length, 2, "fresh readings need no probe");
	utilization = 0.5;
	await refreshClaudeUsage(accounts, { ...deps, force: true });
	assert.equal(calls.length, 4, "Refresh probes every account");
	assert.equal(claudeUsage("claude-subscription")?.percentLeft, 50);

	recordClaudeRateLimit("claude-subscription", week(0.6), clock + CLAUDE_USAGE_FRESH_MS);
	clock += CLAUDE_USAGE_FRESH_MS + 1;
	await refreshClaudeUsage(accounts, deps);
	assert.equal(calls.length, 5, "a real call's reading counts as fresh; only the stale account is probed");
});

test("concurrent refreshes share one probe per account, and a failed probe keeps the last reading", async () => {
	let runs = 0;
	let release!: () => void;
	const gate = new Promise<void>((r) => { release = r; });
	const run: ClaudeRunner = async () => { runs++; await gate; return { code: 1, stdout: "", stderr: "boom" }; };
	recordClaudeRateLimit("claude-subscription-work", week(0.3), 1);
	const deps = { run, binary: () => "/fake/claude", force: true };
	const both = Promise.all([refreshClaudeUsage([accounts[1]!], deps), refreshClaudeUsage([accounts[1]!], deps)]);
	await new Promise((r) => setTimeout(r, 5));
	release();
	await both;
	assert.equal(runs, 1);
	assert.equal(claudeUsage("claude-subscription-work")?.percentLeft, 70);
});

const connected: ClaudeConnection = { state: "connected", email: null, plan: null };
const status = (providerId: string, usage: Partial<ClaudeUsage> | null, connection: ClaudeConnection = connected, email: string | null = null): ClaudeAccountStatus => ({
	account: { providerId, label: providerId, email, auth: "token" },
	connection,
	usage: usage && { percentLeft: 50, resetsAt: RESET, limited: false, checkedAt: 0, ...usage },
});
const NOW = (RESET - 100) * 1000;

test("the next account is the connected, unlimited one with the most left; ties go to the sooner reset; unknown usage comes last", () => {
	const statuses = [
		status("a", { percentLeft: 0, limited: true }),
		status("b", { percentLeft: 40 }),
		status("c", { percentLeft: 70, resetsAt: RESET + 50 }),
		status("d", { percentLeft: 70, resetsAt: RESET + 10 }),
		status("e", null),
		status("f", { percentLeft: 99 }, { state: "signed-out" }),
		status("g", { percentLeft: 90, limited: true }),
	];
	assert.equal(nextClaudeAccount("a", statuses, NOW)?.account.providerId, "d");
	assert.equal(nextClaudeAccount("d", statuses, NOW)?.account.providerId, "c");
	assert.equal(nextClaudeAccount("a", [statuses[0]!, statuses[4]!, statuses[5]!], NOW)?.account.providerId, "e", "an unmeasured account beats none");
	assert.equal(nextClaudeAccount("a", [statuses[0]!, statuses[5]!, statuses[6]!], NOW), null);
	assert.equal(nextClaudeAccount("a", [status("a", null), status("z", { percentLeft: 30, limited: true, resetsAt: RESET - 200 })], NOW)?.account.providerId, "z", "a block that already ended no longer excludes the account");
	assert.equal(nextClaudeAccount("a", [status("a", null), status("z", { percentLeft: 0, limited: true, resetsAt: RESET - 200 })], NOW), null, "an ended block keeps the last weekly share, not a full week");
	assert.equal(nextClaudeAccount("a", [status("a", { percentLeft: 0, limited: true }, undefined, "same@example.com"), status("y", { percentLeft: 80 }, undefined, "same@example.com")], NOW), null, "never the same login under another entry");
	assert.equal(soonestClaudeReset([statuses[2]!, statuses[3]!, statuses[5]!]), RESET + 10);
	assert.equal(soonestClaudeReset([status("x", null)]), null);
});
