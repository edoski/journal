/**
 * Round 20, m14 (3 n4, 1 free). On an Ask from the call-centre question,
 * with "p = 4/n, because" in its box, F reached its weekly limit: the
 * lesson read "Your Claude plan's usage limit is reached. It resets at Tue
 * 4:00 AM. See https://claude.ai/settings/usage." in red, then "Checking
 * your other Claude accounts… Try again", and the box dropped to "Ask the
 * tutor anything…" with his draft gone until a retry worked. Now one line
 * in the app's words and Settings' time format ("F is out until Tuesday
 * 04:00."), the account to go on with, and his answer so far shown with
 * the question it waits for.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

function memoryStorage(): Storage {
	const kept = new Map<string, string>();
	return {
		get length() { return kept.size; },
		key: (i: number) => [...kept.keys()][i] ?? null,
		getItem: (k: string) => kept.get(k) ?? null,
		setItem: (k: string, v: string) => void kept.set(k, String(v)),
		removeItem: (k: string) => void kept.delete(k),
		clear: () => kept.clear(),
	};
}
for (const [key, value] of Object.entries({ localStorage: memoryStorage(), sessionStorage: memoryStorage() })) {
	Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
	Object.defineProperty(dom.window, key, { value, configurable: true, writable: true });
}
(globalThis as Record<string, unknown>).self = globalThis;
if (!(dom.window as { location?: unknown }).location) {
	const location = new URL("http://localhost/chat/c_poisson");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
Object.assign(dom.window, { history: { state: null, replaceState() {}, pushState() {} } });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });

const { createRoot } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { newAnswerResult, newUserMessage, dismissedAnswer, CLAUDE_LIMIT_TEXT } = await import("../src/core/index.ts");
const { carryWords } = await import("../components/lesson/kept-drafts.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;
type NotifySource = import("../components/server-events.tsx").NotifySource;

const CHAT = "c_poisson";
const WS = "/study/probability";
const QUESTION = "With the minute cut into $n$ slots, what chance $p$ must each slot get so that the centre still averages 4 calls a minute, and why?";
const RESET = Math.floor(Date.now() / 1000) + 30 * 3600;
const at = (n: number) => Date.now() - 60_000 + n;
const record = [
	{ id: "a_q", role: "assistant", content: [{ type: "toolCall", id: "q7", name: "explain", arguments: { question: QUESTION, correctAnswer: "4/n", type: "check" } }], stopReason: "toolUse", timestamp: at(1) },
	newAnswerResult("q7", "explain", dismissedAnswer("explain", QUESTION, "asked")),
	newUserMessage("why is it ok to assume the slots are independent? calls to a support line come in bunches when something breaks"),
	{ id: "a_fail", role: "assistant", content: [], stopReason: "error", provider: "claude-subscription-f", errorMessage: `${CLAUDE_LIMIT_TEXT} It resets at Tue 4:00 AM. See https://claude.ai/settings/usage. No API key was used.`, timestamp: at(4) },
] as unknown as LhMessage[];

const originalFetch = globalThis.fetch;
let root: { unmount(): void; render(node: React.ReactNode): void } | null = null;
let host: HTMLElement | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
});

const account = (providerId: string, label: string, percentLeft: number, limited: boolean) => ({ account: { providerId, label, email: null, auth: "token" }, connection: { state: "connected", email: null, plan: null }, usage: { percentLeft, resetsAt: RESET, limited, checkedAt: 1 }, modelMissing: false });

test("the plan's limit on an Ask: one line in the app's words, the account to go on with, and his answer so far in sight", async () => {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/subscriptions/claude") return Response.json({ accounts: [account("claude-subscription-f", "F", 0, true), account("claude-subscription-e", "E", 84, false)] });
		if (url.pathname === `/api/chats/${CHAT}`) return Response.json({ messages: record, turnInFlight: false });
		if (url.pathname === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 200000 });
		if (url.pathname === `/api/chats/${CHAT}/marks`) return Response.json({ ok: true, marks: {} });
		if (url.pathname === "/api/jobs") return Response.json({ jobs: [] });
		return Response.json({});
	}) as typeof fetch;
	carryWords(`carry:${WS}`, { question: QUESTION, from: "q7" }, { text: "p = 4/n, because" }, []);
	const source: NotifySource = { close() {}, onOpen() {}, onEvent() {} };
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(
		<ServerEventsProvider connect={() => source}>
			<Chat chatId={CHAT} title="Poisson distribution lesson" initialMessages={record} course={{ workspace: WS, title: "Probability" }} />
		</ServerEventsProvider>,
	));
	await act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });
	const text = host.textContent ?? "";
	assert.doesNotMatch(text, /claude\.ai|usage limit is reached|4:00 AM/, "no raw limit text");
	assert.match(host.querySelector('[data-testid="claude-limit-out"]')?.textContent ?? "", /^F is out until \w+ \d\d:\d\d\.$/);
	assert.equal(host.querySelector('[data-testid="claude-limit-continue"]')?.textContent, "Continue on E");
	assert.equal(host.querySelector('[data-testid="asked-draft-kept"]')?.textContent, "Your answer so far stays with the question above: “p = 4/n, because”");
});
