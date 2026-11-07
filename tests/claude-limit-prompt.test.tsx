import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ClaudeLimitPrompt, moveClaudeSlots } from "../components/claude-limit-prompt.tsx";
import { claudeResetLabel } from "../components/settings/claude-connection.tsx";
import { retryFailedResponse } from "../components/chat.tsx";
import { onSettingsSaved, type SettingsSection } from "../components/settings-signal.ts";
import { CLAUDE_LIMIT_TEXT, failedResponseAtEnd, isClaudeLimitFailure, type ChatInput, type ClaudeAccountStatus, type ClaudeConnection, type LhMessage, type ModelsSettings } from "../src/core/index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;
let root: Root | undefined, host: HTMLDivElement | undefined, stopSignals: (() => void) | undefined;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; stopSignals?.(); globalThis.fetch = originalFetch; });

const RESET = Math.floor(Date.now() / 1000) + 86_400;
const connected: ClaudeConnection = { state: "connected", email: null, plan: null };
const status = (providerId: string, label: string, percentLeft: number, limited = false, resetsAt = RESET): ClaudeAccountStatus => ({ account: { providerId, label, email: null, auth: "token" }, connection: connected, usage: { percentLeft, resetsAt, limited, checkedAt: 1 } });
const EXHAUSTED = "claude-subscription";
const opus = (provider: string) => ({ model: { provider, id: "claude-opus-5-5" }, thinkingLevel: "high" as const });
const SLOTS: ModelsSettings = { strong: opus(EXHAUSTED), cheap: opus(EXHAUSTED), vision: { model: { provider: "openrouter", id: "vendor/vision" } } };

function install(statuses: ClaudeAccountStatus[]) {
	const calls: { path: string; method: string; body?: unknown }[] = [];
	globalThis.fetch = async (input, init) => {
		const path = String(input), method = init?.method ?? "GET";
		calls.push({ path, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
		if (path === "/api/subscriptions/claude") return Response.json({ accounts: statuses });
		if (path === "/api/chats/c1" && method === "GET") return Response.json({ settings: { model: { provider: EXHAUSTED, id: "claude-opus-5-5" }, thinkingLevel: "xhigh" } });
		if (path === "/api/settings") return Response.json({ settings: { models: SLOTS } });
		if (method === "PUT") return Response.json({ settings: JSON.parse(String(init!.body)) });
		return new Response("not found", { status: 404 });
	};
	const signals: SettingsSection[] = [];
	stopSignals = onSettingsSaved((section) => signals.push(section));
	return { calls, signals };
}
async function mount(onContinue: () => void) {
	host = document.createElement("div"); document.body.append(host); root = createRoot(host);
	await act(async () => root!.render(<ClaudeLimitPrompt chatId="c1" failure={{ provider: EXHAUSTED, model: "claude-opus-5-5" }} onContinue={onContinue} />));
	await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const byTestid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

test("only a Claude account's curated limit failure at the end of the record shows the prompt", () => {
	const failed = (provider: string, errorMessage: string) => ({ id: "a1", role: "assistant", provider, model: "claude-opus-5-5", api: "anthropic-messages", content: [], stopReason: "error", errorMessage, timestamp: 1, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }) as unknown as LhMessage;
	const user = { id: "u1", role: "user", content: "Teach me", timestamp: 0 } as unknown as LhMessage;
	const limit = `${CLAUDE_LIMIT_TEXT} See https://claude.ai/settings/usage. No API key was used.`;
	assert(isClaudeLimitFailure(failedResponseAtEnd([user, failed("claude-subscription-work", limit)])));
	assert(!isClaudeLimitFailure(failedResponseAtEnd([user, failed("claude-subscription-work", "Claude request failed. No API key was used.")])));
	assert(!isClaudeLimitFailure(failedResponseAtEnd([user, failed("openrouter", limit)])));
	assert(!isClaudeLimitFailure(failedResponseAtEnd([user])));
});

test("the prompt offers the account with the most left, then moves the session and the exhausted slots to it and retries", async () => {
	const { calls, signals } = install([status(EXHAUSTED, "Main", 0, true), status("claude-subscription-work", "Work", 40), status("claude-subscription-spare", "Spare", 70)]);
	const sent: ChatInput[] = [];
	const draft = { current: "stale draft" as string | null };
	let writesAtRetry = -1;
	await mount(() => { writesAtRetry = calls.filter((c) => c.method === "PUT").length; retryFailedResponse((input) => { sent.push(input); }, draft); });
	assert(calls.some((c) => c.path === "/api/subscriptions/claude"), "the choice comes from the cached reading, which probes stale accounts");
	const button = byTestid("claude-limit-continue");
	assert.equal(button?.textContent, "Continue on Spare (70% left)");
	await act(async () => { button!.click(); await new Promise((r) => setTimeout(r, 0)); });

	const puts = calls.filter((c) => c.method === "PUT");
	assert.deepEqual(puts[0], { path: "/api/chats/c1/settings", method: "PUT", body: { model: { provider: "claude-subscription-spare", id: "claude-opus-5-5" }, thinkingLevel: "xhigh" } }, "the session keeps its model and thinking on the new account");
	assert.deepEqual(puts[1], { path: "/api/settings/models", method: "PUT", body: { strong: opus("claude-subscription-spare"), cheap: opus("claude-subscription-spare"), vision: SLOTS.vision } }, "only slots on the exhausted account move");
	assert.equal(writesAtRetry, 2, "the retry runs after both writes");
	assert.deepEqual(sent, [{ type: "retry" }]);
	assert.equal(draft.current, null);
	assert(signals.includes("models"), "the pickers re-read");
});

test("with no account left, the prompt says so with the soonest reset and offers no switch", async () => {
	install([status(EXHAUSTED, "Main", 0, true, RESET + 500), status("claude-subscription-work", "Work", 0, true, RESET)]);
	let continued = false;
	await mount(() => { continued = true; });
	assert.equal(byTestid("claude-limit-continue"), null);
	assert.equal(byTestid("claude-limit-none")?.textContent, `All Claude accounts are at their limit · the first resets ${claudeResetLabel(RESET)}`);
	assert.equal(continued, false);
});

test("moving slots touches only those on the exhausted account and reports when none were", () => {
	assert.deepEqual(moveClaudeSlots(SLOTS, EXHAUSTED, "claude-subscription-x"), { strong: opus("claude-subscription-x"), cheap: opus("claude-subscription-x"), vision: SLOTS.vision });
	assert.equal(moveClaudeSlots(SLOTS, "claude-subscription-other", "claude-subscription-x"), null);
});
