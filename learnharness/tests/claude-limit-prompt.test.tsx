import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ClaudeLimitPrompt } from "../components/claude-limit-prompt.tsx";
import { claudeResetLabel } from "../components/settings/claude-connection.tsx";
import { retryFailedResponse } from "../components/chat.tsx";
import { onSettingsSaved, type SettingsSection } from "../components/settings-signal.ts";
import { CLAUDE_LIMIT_TEXT, failedResponseAtEnd, isClaudeLimitFailure, type ChatInput, type ClaudeAccountStatus, type ClaudeConnection, type LhMessage } from "../src/core/index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;
let root: Root | undefined, host: HTMLDivElement | undefined, stopSignals: (() => void) | undefined;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; stopSignals?.(); globalThis.fetch = originalFetch; });

const RESET = Math.floor(Date.now() / 1000) + 86_400;
const connected: ClaudeConnection = { state: "connected", email: null, plan: null };
const status = (providerId: string, label: string, percentLeft: number, limited = false, resetsAt = RESET): ClaudeAccountStatus => ({ account: { providerId, label, email: null, auth: "token" }, connection: connected, usage: { percentLeft, resetsAt, limited, checkedAt: 1 }, modelMissing: false });
const EXHAUSTED = "claude-subscription";

function install(statuses: ClaudeAccountStatus[]) {
	const calls: { path: string; method: string; body?: unknown }[] = [];
	globalThis.fetch = async (input, init) => {
		const path = String(input), method = init?.method ?? "GET";
		calls.push({ path, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
		if (path === "/api/subscriptions/claude") return Response.json({ accounts: statuses });
		if (method === "PUT") return Response.json({ settings: JSON.parse(String(init!.body)) });
		return new Response("not found", { status: 404 });
	};
	const signals: SettingsSection[] = [];
	stopSignals = onSettingsSaved((section) => signals.push(section));
	return { calls, signals };
}
async function mount(onContinue: () => void) {
	host = document.createElement("div"); document.body.append(host); root = createRoot(host);
	await act(async () => root!.render(<ClaudeLimitPrompt failure={{ provider: EXHAUSTED }} onContinue={onContinue} />));
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

test("the prompt offers the account with the most left, then moves every agent to it and retries", async () => {
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
	assert.deepEqual(puts, [{ path: "/api/settings/claude", method: "PUT", body: { account: "claude-subscription-spare" } }], "one write: the account every agent runs on");
	assert.equal(writesAtRetry, 1, "the retry runs after the write");
	assert.deepEqual(sent, [{ type: "retry" }]);
	assert.equal(draft.current, null);
	assert(signals.includes("claude"), "readers re-read");
});

test("with no account left, the prompt says so with the soonest reset and offers no switch", async () => {
	install([status(EXHAUSTED, "Main", 0, true, RESET + 500), status("claude-subscription-work", "Work", 0, true, RESET)]);
	let continued = false;
	await mount(() => { continued = true; });
	assert.ok(byTestid("claude-limit-continue") === null);
	assert.equal(byTestid("claude-limit-none")?.textContent, `All Claude accounts are at their limit · the first resets ${claudeResetLabel(RESET)}`);
	assert.equal(continued, false);
});
