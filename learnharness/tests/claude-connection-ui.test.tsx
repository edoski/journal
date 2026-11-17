import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { CLAUDE_LABEL, CLAUDE_MODEL_MISSING_LINE, CLAUDE_NOTICE, ClaudeConnectionRow, claudeResetLabel } from "../components/settings/claude-connection.tsx";
import { onSettingsSaved, type SettingsSection } from "../components/settings-signal.ts";
import type { ClaudeAccountStatus, ClaudeConnection, ModelStatus } from "../src/core/index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;
let root: Root | undefined, host: HTMLDivElement | undefined, stopSignals: (() => void) | undefined;

const RESET = 1_800_000_000;
const status = (account: string): ModelStatus => ({ account, connected: true, contextWindow: 1_000_000 });
const account = (providerId: string, label: string, connection: ClaudeConnection, usage: ClaudeAccountStatus["usage"] = null, email: string | null = null, auth: "token" | "profile" | "default" = "token", modelMissing = false): ClaudeAccountStatus => ({ account: { providerId, label, email, auth }, connection, usage, modelMissing });
const connected: ClaudeConnection = { state: "connected", email: null, plan: null };

function install(rounds: ClaudeAccountStatus[][]) {
	const calls: { path: string; method: string; body?: unknown }[] = [];
	let current = "claude-subscription";
	globalThis.fetch = async (input, init) => {
		const path = String(input), method = init?.method ?? "GET";
		calls.push({ path, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
		if (path.startsWith("/api/subscriptions/claude")) return Response.json({ accounts: rounds.length > 1 ? rounds.shift() : rounds[0] });
		if (path.startsWith("/api/models")) return Response.json(status(current));
		if (path === "/api/settings/claude" && method === "PUT") { current = (JSON.parse(String(init!.body)) as { account: string }).account; return Response.json({ settings: { version: 1, claude: { account: current } } }); }
		return new Response("not found", { status: 404 });
	};
	const signals: SettingsSection[] = [];
	stopSignals = onSettingsSaved((section) => signals.push(section));
	return { calls, signals };
}
async function mount() {
	host = document.createElement("div"); document.body.append(host); root = createRoot(host);
	await act(async () => root!.render(<ClaudeConnectionRow />));
	await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const rows = () => [...document.querySelectorAll('[data-testid="claude-account"]')] as HTMLElement[];
const row = (providerId: string) => rows().find((r) => r.getAttribute("data-provider") === providerId)!;
const text = (el: Element | null | undefined, testid: string) => el?.querySelector(`[data-testid="${testid}"]`)?.textContent ?? null;
async function click(element: Element | null | undefined) { assert(element); await act(async () => { (element as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); }); }
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; stopSignals?.(); globalThis.fetch = originalFetch; });

test("each non-connected state says what to do, with one Refresh and no sign-in button", async () => {
	const cases: [ClaudeAccountStatus, RegExp][] = [
		[account("claude-subscription", "Claude Code", { state: "missing" }, null, null, "default"), /Claude Code is not installed/],
		[account("claude-subscription", "Claude Code", { state: "signed-out" }, null, null, "default"), /Run `claude` in a terminal and sign in with your Claude account, then press Refresh/],
		[{ ...account("claude-subscription", "Claude Code", { state: "signed-out" }, null, "me@example.com", "default"), account: { providerId: "claude-subscription", label: "Claude Code", email: "me@example.com", auth: "default", notInT3: true } }, /^LearnHarness can't find your Claude accounts in T3 Code\. Open T3 Code, check them, then press Refresh\.$/],
		[account("claude-subscription-work", "Work", { state: "signed-out" }), /This account isn't signed in\. Sign in to it again in T3 Code, then press Refresh/],
		[account("claude-subscription", "Claude Code", { state: "not-subscription", authMethod: "api_key" }, null, null, "default"), /signed in with an API key, which would not use your Claude plan\. Run `claude`, then `\/login`/],
		[account("claude-subscription", "Claude Code", { state: "error", message: "Claude Code could not report its sign-in status." }, null, null, "default"), /could not report its sign-in status/],
	];
	for (const [status, sentence] of cases) {
		install([[status]]);
		await mount();
		assert.match(document.querySelector('[data-testid="claude-connection-state"]')?.textContent ?? "", sentence);
		assert(document.body.textContent!.includes(CLAUDE_LABEL));
		assert(document.body.textContent!.includes(CLAUDE_NOTICE));
		assert.deepEqual([...document.querySelectorAll("button")].map((b) => b.textContent), ["Refresh"], `${status.connection.state}: only Refresh`);
		await act(async () => root?.unmount()); host?.remove(); stopSignals?.();
	}
});

test("one row per account with its email and weekly usage; Use this account switches every agent to it, and In use follows", async () => {
	const { calls, signals } = install([[
		account("claude-subscription", "Main", { state: "connected", email: "learner@example.com", plan: "max" }, { percentLeft: 62, resetsAt: RESET, limited: false, checkedAt: 1 }, null, "default"),
		account("claude-subscription-work", "Work", connected, { percentLeft: 0, resetsAt: RESET, limited: true, checkedAt: 1 }, "work@example.com"),
		account("claude-subscription-spare", "Spare", { state: "signed-out" }, null),
	]]);
	await mount();
	assert.deepEqual(rows().map((r) => text(r, "claude-account-name")), ["learner@example.com", "work@example.com", "Spare"], "named by email, a token account's from its config dir; T3 Code's name only without one");
	assert.equal(text(row("claude-subscription"), "claude-connection-state"), "Signed in through Claude Code on the Max plan");
	assert.equal(text(row("claude-subscription-work"), "claude-connection-state"), "Signed in through Claude Code");
	assert.equal(text(row("claude-subscription"), "claude-usage"), `About half left this week, resets ${claudeResetLabel(RESET)}`);
	assert.equal(text(row("claude-subscription-work"), "claude-usage"), `At its limit until ${claudeResetLabel(RESET)}`);
	assert.doesNotMatch(document.body.textContent!, /%|\d+ left/, "no percentages or counts");
	assert.equal(text(row("claude-subscription-spare"), "claude-usage"), null);
	assert.equal(text(row("claude-subscription"), "claude-in-use"), "In use");
	assert.ok(row("claude-subscription").querySelector('[data-testid="claude-use-account"]') === null, "the account in use offers no switch");
	assert.ok(row("claude-subscription-spare").querySelector('[data-testid="claude-use-account"]') === null, "a signed-out account offers no switch");

	await click(row("claude-subscription-work").querySelector('[data-testid="claude-use-account"]'));
	const put = calls.find((c) => c.method === "PUT");
	assert.equal(put?.path, "/api/settings/claude");
	assert.deepEqual(put?.body, { account: "claude-subscription-work" });
	assert(signals.includes("claude"), "readers re-read after the switch");
	await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
	assert.equal(text(row("claude-subscription-work"), "claude-in-use"), "In use");
	assert(row("claude-subscription").querySelector('[data-testid="claude-use-account"]'), "the other account is offered now");
});

test("an account whose plan lacks the model says so in one line", async () => {
	install([[
		account("claude-subscription", "Main", connected, null, null, "default", true),
		account("claude-subscription-work", "Work", connected),
	]]);
	await mount();
	assert.equal(text(row("claude-subscription"), "claude-model-missing"), CLAUDE_MODEL_MISSING_LINE);
	assert.match(CLAUDE_MODEL_MISSING_LINE, /^Claude Opus 5\.5 is not available on this account's plan/);
	assert.equal(text(row("claude-subscription-work"), "claude-model-missing"), null);
});

test("Refresh forces a fresh check of every account and tells readers the connections changed", async () => {
	const { calls, signals } = install([
		[account("claude-subscription", "Claude Code", { state: "signed-out" }, null, null, "default")],
		[account("claude-subscription", "Claude Code", { state: "connected", email: null, plan: "pro" }, null, null, "default")],
	]);
	await mount();
	assert.deepEqual(calls.filter((c) => c.path.startsWith("/api/subscriptions/claude")).map((c) => c.path), ["/api/subscriptions/claude"]);
	await click(document.querySelector('[data-testid="claude-refresh"]'));
	assert(calls.some((c) => c.path === "/api/subscriptions/claude?refresh=1"));
	assert.equal(text(rows()[0], "claude-connection-state"), "Signed in through Claude Code on the Pro plan");
	assert(signals.includes("keys"));
});

test("Refresh redraws every row as being checked until the fresh reading lands, and tells readers even once the dialog has closed (round 10, 4 minor 1)", async () => {
	let land!: () => void;
	const landed = new Promise<void>((done) => { land = done; });
	const { calls, signals } = install([
		[account("claude-subscription", "Claude Code", { state: "signed-out" }, null, null, "default")],
		[account("claude-subscription", "Claude Code", connected, null, null, "default")],
	]);
	const served = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		if (String(input) === "/api/subscriptions/claude?refresh=1") await landed;
		return served(input, init);
	};
	await mount();
	assert.equal(text(rows()[0], "claude-connection-state"), "Run `claude` in a terminal and sign in with your Claude account, then press Refresh.");
	await click(document.querySelector('[data-testid="claude-refresh"]'));
	assert.equal(text(rows()[0], "claude-connection-state"), "Checking Claude Code…", "no row goes on saying it isn't signed in while the check runs (53)");
	assert(calls.some((c) => c.path === "/api/models?refresh=1"), "the sign-in itself is re-checked at once, apart from the usage probes");
	await act(async () => root?.unmount());
	root = undefined;
	await act(async () => { land(); await new Promise((r) => setTimeout(r, 0)); });
	assert(signals.includes("keys"), "every reader hears the fresh reading, the pill and the line included");
});

test("usage reads in words from plenty to nothing, with the day it resets", async () => {
	const usage = (percentLeft: number) => ({ percentLeft, resetsAt: RESET, limited: false, checkedAt: 1 });
	install([[
		account("claude-subscription", "Main", connected, usage(93), "a@example.com", "default"),
		account("claude-subscription-b", "B", connected, usage(13), "b@example.com"),
		account("claude-subscription-c", "C", connected, usage(0), "c@example.com"),
	]]);
	await mount();
	assert.deepEqual(rows().map((r) => text(r, "claude-usage")), [
		`Plenty left this week, resets ${claudeResetLabel(RESET)}`,
		`Little left this week, resets ${claudeResetLabel(RESET)}`,
		`Nothing left this week, resets ${claudeResetLabel(RESET)}`,
	]);
	assert.match(claudeResetLabel(RESET), /^[A-Z][a-z]+day \d\d:\d\d$/, "the reset names its whole day");
});

test("two accounts on one email keep their names apart with T3 Code's name for each", async () => {
	install([[
		account("claude-subscription", "E", connected, null, "edo@example.com"),
		account("claude-subscription-f", "F", connected, null, "edo@example.com"),
		account("claude-subscription-a", "A", connected, null, "amir@example.com"),
	]]);
	await mount();
	assert.deepEqual(rows().map((r) => text(r, "claude-account-name")), ["edo@example.com, named E in T3 Code", "edo@example.com, named F in T3 Code", "amir@example.com"]);
});

test("the note about the plan is a row of its own after the last account", async () => {
	install([[account("claude-subscription", "Main", connected, null, "a@example.com", "default")]]);
	await mount();
	const parts = [...host!.children];
	assert.deepEqual(parts.map((el) => el.getAttribute("data-testid")), ["claude-connection", "claude-account", "claude-notice"], "the header, each account and the note are sibling rows the group parts with hairlines");
	assert.equal(parts.at(-1)!.textContent, CLAUDE_NOTICE);
});

/** Round 14, 4 minor 7: with the token folder moved aside, the sign-in
 *  dialog read "This account isn't signed in…" under each of four
 *  accounts, and "can't find your Claude accounts" still listed the plain
 *  `claude` standing in for them. */
test("every account failing alike says it once, above the names; none found in T3 Code lists none", async () => {
	const out = (id: string, email: string) => account(id, id, { state: "signed-out" }, null, email);
	install([[out("claude-subscription-a", "a@example.com"), out("claude-subscription-b", "b@example.com"), out("claude-subscription-c", "c@example.com"), out("claude-subscription-d", "d@example.com")]]);
	await mount();
	const said = [...document.querySelectorAll('[data-testid="claude-connection-state"]')].map((p) => p.textContent);
	assert.deepEqual(said, ["This account isn't signed in. Sign in to it again in T3 Code, then press Refresh."], "said once");
	assert.deepEqual(rows().map((r) => text(r, "claude-account-name")), ["a@example.com", "b@example.com", "c@example.com", "d@example.com"], "every account still named");
	await act(async () => root?.unmount()); host?.remove(); stopSignals?.();

	install([[{ ...account("claude-subscription", "Claude Code", { state: "signed-out" }, null, "edoxtreme@example.com", "default"), account: { providerId: "claude-subscription", label: "Claude Code", email: "edoxtreme@example.com", auth: "default", notInT3: true } }]]);
	await mount();
	assert.equal(rows().length, 0, "no account listed when none is found");
	assert.match(document.body.textContent!, /can't find your Claude accounts in T3 Code/);
	assert.doesNotMatch(document.body.textContent!, /edoxtreme/);
});

/** Round 15, m23: the one line, "This account isn't signed in…", sat
 *  above four accounts and named none. It now sits on the account in use. */
test("every account failing alike says it once, on the row of the account in use", async () => {
	const out = (id: string, email: string) => account(id, id, { state: "signed-out" }, null, email);
	install([[out("claude-subscription-a", "a@example.com"), out("claude-subscription", "main@example.com"), out("claude-subscription-c", "c@example.com"), out("claude-subscription-d", "d@example.com")]]);
	await mount();
	await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
	const said = [...document.querySelectorAll('[data-testid="claude-connection-state"]')];
	assert.equal(said.length, 1, "said once");
	assert.equal(said[0]!.textContent, "This account isn't signed in. Sign in to it again in T3 Code, then press Refresh.");
	assert.ok(said[0]!.closest('[data-testid="claude-account"]') === row("claude-subscription"), "on the row of the account in use, the one it names");
	assert.equal(text(row("claude-subscription"), "claude-in-use"), "In use");
});

test("accounts that fail differently, or a mix with one signed in, keep a line under each", async () => {
	install([[account("claude-subscription", "Main", connected, null, "main@example.com", "default"), account("claude-subscription-work", "Work", { state: "signed-out" }, null, "work@example.com")]]);
	await mount();
	assert.equal(document.querySelectorAll('[data-testid="claude-connection-state"]').length, 2);
});
