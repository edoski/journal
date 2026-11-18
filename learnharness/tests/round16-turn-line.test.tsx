/**
 * Round 16, m2 (4 minor 4; round-15 M2's remainder) and m3 (4 minor 6,
 * 1 free). With the tokens moved aside mid-session, a turn was refused:
 * "Claude isn't signed in, so the tutor couldn't reply. Sign in, then press
 * Retry.", with Retry alone and no sign-in on the line (`56`). With the
 * tokens back and `/api/models` connected, the line stood 30 s and more
 * (`57`): nothing read the status again. After a reload it read "The tutor
 * stopped before replying. Try again", though the tutor never started
 * (`58d`). "Retry" and "Try again" named one act on two lines, and the
 * sidebar's "Couldn't reply" named nothing to do.
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
	const location = new URL("http://localhost/chat/c_signed16");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
Object.assign(dom.window, { history: { state: null, replaceState() {}, pushState() {} } });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });

const { createRoot } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
type NotifySource = import("../components/server-events.tsx").NotifySource;
const quietSource: NotifySource = { close() {}, onOpen() {}, onEvent() {} };
const lesson = () => (
	<ServerEventsProvider connect={() => quietSource}>
		<Chat chatId={CHAT} title="Rank practice" initialMessages={record} course={{ workspace: "la", title: "Linear Algebra" }} />
	</ServerEventsProvider>
);
const { newUserMessage, CLAUDE_ACCOUNT_SIGNED_OUT } = await import("../src/core/index.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;

const CHAT = "c_signed16";
const asked = newUserMessage("Next problem please") as LhMessage;
const refused = {
	id: "a_refused",
	role: "assistant",
	content: [],
	stopReason: "error",
	errorMessage: `${CLAUDE_ACCOUNT_SIGNED_OUT} No API key was used.`,
	provider: "claude-subscription",
	timestamp: Date.now(),
} as unknown as LhMessage;
const record = [asked, refused];

const originalFetch = globalThis.fetch;
let connected = false;
let reads: string[] = [];
let root: { unmount(): void; render(node: React.ReactNode): void } | null = null;
let host: HTMLElement | null = null;

function stubFetch() {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/models") {
			reads.push(url.search);
			return Response.json({ account: "claude-subscription", connected, contextWindow: 200000 });
		}
		if (url.pathname === `/api/chats/${CHAT}`) return Response.json({ messages: record, turnInFlight: false });
		if (url.pathname === `/api/chats/${CHAT}/marks`) return Response.json({ ok: true, marks: {} });
		if (url.pathname === "/api/jobs") return Response.json({ jobs: [] });
		if (url.pathname === "/api/courses") return Response.json({ available: true, courses: [{ workspace: "la" }] });
		if (url.pathname === "/api/subscriptions/claude") return Response.json({ accounts: [] });
		return Response.json({});
	}) as typeof fetch;
}

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });

afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
	connected = false;
	reads = [];
});

async function mount() {
	stubFetch();
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(lesson()));
	await settle();
	return host;
}

test("a signed-out line asks again at once, and goes when he comes back signed in, leaving one Try again (round 16, m2)", async () => {
	const pane = await mount();
	assert.ok(reads.includes("?refresh=1"), `the failure re-checks the sign-in at once (${JSON.stringify(reads)})`);
	assert.match(pane.querySelector('[data-testid="turn-error"]')?.textContent ?? "", /isn't signed in/);
	assert.doesNotMatch(pane.textContent ?? "", /Sign in, then|press Retry/, "the line asks nothing it has no control for");
	connected = true;
	await act(async () => void dom.window.dispatchEvent(new dom.window.Event("focus")));
	await settle();
	const line = pane.querySelector('[data-testid="turn-error"]');
	assert.ok(line === null, `the line goes once he is back (${line?.textContent})`);
	assert.equal(pane.querySelector('[data-testid="reply-cut"]')?.textContent, "The tutor couldn't reply.Try again");
});

test("reopened once Claude is connected, the failed turn says the tutor couldn't reply, never that it stopped (round 16, m2)", async () => {
	connected = true;
	const pane = await mount();
	assert.equal(pane.querySelector('[data-testid="reply-cut"]')?.textContent, "The tutor couldn't reply.Try again");
});

test("every turn line names its one act Try again, and a failed session's status says it (round 16, m3)", async () => {
	const pane = await mount();
	const buttons = [...pane.querySelectorAll('[data-testid="turn-error"] button')].map((b) => b.textContent);
	assert.deepEqual(buttons, ["Try again"]);
	const { pausedWords } = await import("../components/nav/session-state.ts");
	assert.equal(pausedWords({ failed: true }), "Try again");
});
