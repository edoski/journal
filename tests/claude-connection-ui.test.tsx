import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { CLAUDE_LABEL, CLAUDE_NOTICE, ClaudeConnectionRow, claudeResetLabel, claudeRoleModels } from "../components/settings/claude-connection.tsx";
import { onSettingsSaved, type SettingsSection } from "../components/settings-signal.ts";
import type { ClaudeAccountStatus, ClaudeConnection, ModelCatalogResponse } from "../src/core/index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;
let root: Root | undefined, host: HTMLDivElement | undefined, stopSignals: (() => void) | undefined;

const RESET = 1_800_000_000;
const pin = (provider: string, id: string) => ({ model: { provider, id } });
function catalog(slotProvider: string): ModelCatalogResponse {
	const slot = pin(slotProvider, slotProvider === "openrouter" ? "vendor/model" : "claude-opus-5-5");
	return { models: [], defaults: null, rolePins: { researcher: null, demoBuilder: null, visualMaker: null, extractor: null, auditor: null }, slots: { strong: slot, cheap: slot, vision: slot }, providers: [] };
}
const account = (providerId: string, label: string, connection: ClaudeConnection, usage: ClaudeAccountStatus["usage"] = null, email: string | null = null, auth: "token" | "profile" | "default" = "token"): ClaudeAccountStatus => ({ account: { providerId, label, email, auth }, connection, usage });
const connected: ClaudeConnection = { state: "connected", email: null, plan: null };

function install(rounds: ClaudeAccountStatus[][]) {
	const calls: { path: string; method: string; body?: unknown }[] = [];
	let slotProvider = "openrouter";
	globalThis.fetch = async (input, init) => {
		const path = String(input), method = init?.method ?? "GET";
		calls.push({ path, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
		if (path.startsWith("/api/subscriptions/claude")) return Response.json({ accounts: rounds.length > 1 ? rounds.shift() : rounds[0] });
		if (path === "/api/models") return Response.json(catalog(slotProvider));
		if (path === "/api/settings/models" && method === "PUT") { slotProvider = (JSON.parse(String(init!.body)) as { strong: { model: { provider: string } } }).strong.model.provider; return Response.json({ settings: { version: 1, models: JSON.parse(String(init!.body)) } }); }
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
		[account("claude-subscription-work", "Work", { state: "signed-out" }), /did not accept T3 Code's setup token for this account\. Renew it in T3 Code/],
		[account("claude-subscription", "Claude Code", { state: "not-subscription", authMethod: "api_key" }, null, null, "default"), /signed in with an API key, which would not use your Claude plan\. Run `claude`, then `\/login`/],
		[account("claude-subscription", "Claude Code", { state: "error", message: "Claude Code could not report its sign-in status." }, null, null, "default"), /could not report its sign-in status/],
	];
	for (const [status, sentence] of cases) {
		install([[status]]);
		await mount();
		assert.match(text(rows()[0], "claude-connection-state")!, sentence);
		assert(document.body.textContent!.includes(CLAUDE_LABEL));
		assert(document.body.textContent!.includes(CLAUDE_NOTICE));
		assert.deepEqual([...document.querySelectorAll("button")].map((b) => b.textContent), ["Refresh"], `${status.connection.state}: only Refresh`);
		await act(async () => root?.unmount()); host?.remove(); stopSignals?.();
	}
});

test("one row per account with its email and weekly usage; Use for all roles writes that account to the three slots, then hides on it", async () => {
	const { calls, signals } = install([[
		account("claude-subscription", "Main", { state: "connected", email: "learner@example.com", plan: "max" }, { percentLeft: 62, resetsAt: RESET, limited: false, checkedAt: 1 }, null, "default"),
		account("claude-subscription-work", "Work", connected, { percentLeft: 0, resetsAt: RESET, limited: true, checkedAt: 1 }, "work@example.com"),
		account("claude-subscription-spare", "Spare", { state: "signed-out" }, null),
	]]);
	await mount();
	assert.deepEqual(rows().map((r) => r.querySelector("span")!.textContent), ["Claude · Main", "Claude · Work", "Claude · Spare"]);
	assert.equal(text(row("claude-subscription"), "claude-connection-state"), "Signed in as learner@example.com · Max plan via Claude Code");
	assert.equal(text(row("claude-subscription-work"), "claude-connection-state"), "Signed in as work@example.com via Claude Code", "a token account's email comes from its config dir");
	assert.equal(text(row("claude-subscription"), "claude-usage"), `62% left this week · resets ${claudeResetLabel(RESET)}`);
	assert.equal(text(row("claude-subscription-work"), "claude-usage"), `limit reached · resets ${claudeResetLabel(RESET)}`);
	assert.equal(text(row("claude-subscription-spare"), "claude-usage"), null);
	assert.equal(row("claude-subscription-spare").querySelector('[data-testid="claude-use-all"]'), null, "a signed-out account offers no switch");

	await click(row("claude-subscription-work").querySelector('[data-testid="claude-use-all"]'));
	const put = calls.find((c) => c.method === "PUT");
	assert.equal(put?.path, "/api/settings/models");
	const opusHigh = { ...pin("claude-subscription-work", "claude-opus-5-5"), thinkingLevel: "high" };
	assert.deepEqual(put?.body, { strong: opusHigh, cheap: opusHigh, vision: opusHigh });
	assert.deepEqual(put?.body, claudeRoleModels("claude-subscription-work"));
	assert(signals.includes("models"), "model menus re-read after the write");
	await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
	assert.equal(row("claude-subscription-work").querySelector('[data-testid="claude-use-all"]'), null, "hidden on the account that holds every slot");
	assert(row("claude-subscription").querySelector('[data-testid="claude-use-all"]'), "still offered on the other account");
});

test("Refresh forces a fresh check of every account and tells model menus the connections changed", async () => {
	const { calls, signals } = install([
		[account("claude-subscription", "Claude Code", { state: "signed-out" }, null, null, "default")],
		[account("claude-subscription", "Claude Code", { state: "connected", email: null, plan: "pro" }, null, null, "default")],
	]);
	await mount();
	assert.deepEqual(calls.filter((c) => c.path.startsWith("/api/subscriptions/claude")).map((c) => c.path), ["/api/subscriptions/claude"]);
	await click(document.querySelector('[data-testid="claude-refresh"]'));
	assert(calls.some((c) => c.path === "/api/subscriptions/claude?refresh=1"));
	assert.equal(text(rows()[0], "claude-connection-state"), "Signed in · Pro plan via Claude Code");
	assert(signals.includes("keys"));
});
