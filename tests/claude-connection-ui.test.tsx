import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { CLAUDE_LABEL, CLAUDE_NOTICE, ClaudeConnectionRow, claudeRoleModels } from "../components/settings/claude-connection.tsx";
import { onSettingsSaved, type SettingsSection } from "../components/settings-signal.ts";
import type { ClaudeConnection, ModelCatalogResponse } from "../src/core/index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;
let root: Root | undefined, host: HTMLDivElement | undefined, stopSignals: (() => void) | undefined;

const pin = (provider: string, id: string) => ({ model: { provider, id } });
function catalog(allClaude: boolean): ModelCatalogResponse {
	const slot = allClaude ? pin("claude-subscription", "claude-opus-5-5") : pin("openrouter", "vendor/model");
	return { models: [], defaults: null, rolePins: { researcher: null, demoBuilder: null, visualMaker: null, extractor: null, auditor: null }, slots: { strong: slot, cheap: slot, vision: slot }, providers: [] };
}

function install(connections: ClaudeConnection[]) {
	const calls: { path: string; method: string; body?: unknown }[] = [];
	let slotsAllClaude = false;
	globalThis.fetch = async (input, init) => {
		const path = String(input), method = init?.method ?? "GET";
		calls.push({ path, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
		if (path.startsWith("/api/subscriptions/claude")) return Response.json({ connection: connections.length > 1 ? connections.shift() : connections[0] });
		if (path === "/api/models") return Response.json(catalog(slotsAllClaude));
		if (path === "/api/settings/models" && method === "PUT") { slotsAllClaude = true; return Response.json({ settings: { version: 1, models: JSON.parse(String(init!.body)) } }); }
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
const state = () => document.querySelector('[data-testid="claude-connection-state"]')!.textContent;
const useAll = () => document.querySelector<HTMLButtonElement>('[data-testid="claude-use-all"]');
async function click(element: HTMLElement | null) { assert(element); await act(async () => { element.click(); await new Promise((r) => setTimeout(r, 0)); }); }
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; stopSignals?.(); globalThis.fetch = originalFetch; });

test("each non-connected state says what to do in Claude Code, with Refresh and no sign-in button", async () => {
	const cases: [ClaudeConnection, RegExp][] = [
		[{ state: "missing" }, /Claude Code is not installed/],
		[{ state: "signed-out" }, /Run `claude` in a terminal and sign in with your Claude account, then press Refresh/],
		[{ state: "not-subscription", authMethod: "api_key" }, /signed in with an API key, which would not use your Claude plan\. Run `claude`, then `\/login`/],
		[{ state: "error", message: "Claude Code could not report its sign-in status." }, /could not report its sign-in status/],
	];
	for (const [connection, sentence] of cases) {
		install([connection]);
		await mount();
		assert.match(state()!, sentence);
		assert(document.body.textContent!.includes(CLAUDE_LABEL));
		assert(document.body.textContent!.includes(CLAUDE_NOTICE));
		const buttons = [...document.querySelectorAll("button")].map((b) => b.textContent);
		assert.deepEqual(buttons, ["Refresh"], `${connection.state}: only Refresh`);
		await act(async () => root?.unmount()); host?.remove(); stopSignals?.();
	}
});

test("connected shows the account and plan; Use for all roles writes the three slots and then hides", async () => {
	const { calls, signals } = install([{ state: "connected", email: "learner@example.com", plan: "max" }]);
	await mount();
	assert.equal(state(), "Signed in as learner@example.com · Max plan via Claude Code");
	await click(useAll());
	const put = calls.find((c) => c.method === "PUT");
	assert.equal(put?.path, "/api/settings/models");
	assert.deepEqual(put?.body, claudeRoleModels());
	const opusHigh = { ...pin("claude-subscription", "claude-opus-5-5"), thinkingLevel: "high" };
	assert.deepEqual(put?.body, { strong: opusHigh, cheap: opusHigh, vision: opusHigh });
	assert(signals.includes("models"), "model menus re-read after the write");
	await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
	assert.equal(useAll(), null, "hidden once every slot already uses Claude");
});

test("Refresh forces a fresh check and tells model menus the connection changed", async () => {
	const { calls, signals } = install([{ state: "signed-out" }, { state: "connected", email: null, plan: "pro" }]);
	await mount();
	assert.match(state()!, /Run `claude`/);
	await click(document.querySelector<HTMLButtonElement>('[data-testid="claude-refresh"]'));
	assert(calls.some((c) => c.path === "/api/subscriptions/claude?refresh=1"));
	assert.equal(state(), "Signed in · Pro plan via Claude Code");
	assert(signals.includes("keys"));
});
