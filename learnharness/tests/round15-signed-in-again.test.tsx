/**
 * Round 15, M2 (4 major 1): on the line a refused turn left ("Claude isn't
 * signed in, so the tutor couldn't reply. Sign in, then press Retry."),
 * pressing "Sign in to Claude" once Claude was signed in again crashed the
 * page with React #185, a maximum update depth (2 of 2, `58c`, `59`). The
 * button showed exactly while Claude was connected, and the line's watch
 * kept clearing an error that lives in the record, re-rendering each time.
 * Now the line goes once a reading says Claude is connected, Retry stays,
 * and the sign-in dialog never opens while connected.
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
	const location = new URL("http://localhost/chat/c_signed");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
Object.assign(dom.window, { history: { state: null, replaceState() {}, pushState() {} } });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });

const { createRoot } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { SetupDialog } = await import("../components/setup-dialog.tsx");
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

const CHAT = "c_signed";
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
let connected = true;
let root: { unmount(): void; render(node: React.ReactNode): void } | null = null;
let host: HTMLElement | null = null;
const errors: string[] = [];
const originalError = console.error;

function stubFetch() {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/models") return Response.json({ account: "claude-subscription", connected, contextWindow: 200000 });
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
	console.error = originalError;
	errors.length = 0;
	connected = true;
});

function watchErrors() {
	console.error = (...args: unknown[]) => {
		const said = args.map(String).join(" ");
		if (errors.length < 20) errors.push(said);
		// An effect that updates on every render loops for ever: stop it here.
		if (/Maximum update depth/.test(said)) throw new Error("maximum update depth");
	};
}

const depthErrors = () => errors.filter((e) => /Maximum update depth|#185/.test(e));

test("a refused turn's signed-out line goes once Claude reads connected, with no Sign in and no update loop; Retry stays (round 15, M2)", async () => {
	watchErrors();
	stubFetch();
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(lesson()));
	await settle();
	assert.deepEqual(depthErrors(), [], "no maximum update depth");
	assert.ok(host.querySelector('[data-testid="turn-error-sign-in"]') === null, "no Sign in to Claude while Claude is connected");
	const line = host.querySelector('[data-testid="turn-error"]');
	assert.ok(line === null || !/isn't signed in/.test(line.textContent ?? ""), `the signed-out line is gone (${line?.textContent})`);
	const retry = host.querySelector('[data-testid="reply-cut-retry"], [data-testid="retry-failed-turn"]');
	assert.ok(retry !== null, "Retry stays for the turn that failed");
});

test("the signed-out line stays while Claude still reads signed out, and the line itself offers no Sign in", async () => {
	connected = false;
	watchErrors();
	stubFetch();
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(lesson()));
	await settle();
	assert.deepEqual(depthErrors(), []);
	const line = host.querySelector('[data-testid="turn-error"]');
	assert.match(line?.textContent ?? "", /isn't signed in/);
	assert.ok(host.querySelector('[data-testid="turn-error-sign-in"]') === null, "the pill above the box is the one sign-in");
});

test("the sign-in dialog opened while Claude is connected closes once, with an inline onClose, and raises no update-depth error", async () => {
	watchErrors();
	stubFetch();
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	let closes = 0;
	function Harness() {
		const [open, setOpen] = React.useState(true);
		const [, rerender] = React.useState(0);
		void setOpen;
		// The parent re-renders on every close, as the lesson does, and its
		// open state lags: the close must still fire once for this open.
		return <SetupDialog open={open} onClose={() => { closes++; rerender((n) => n + 1); }} />;
	}
	await act(async () => root!.render(<Harness />));
	await settle();
	assert.deepEqual(depthErrors(), []);
	assert.equal(closes, 1, "the close fires once per open");
});

test("once Claude reads signed in, the refused turn's line says so and what to do now, never the vaguer couldn't reply (round 19, m27)", async () => {
	watchErrors();
	stubFetch();
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(lesson()));
	await settle();
	const cut = host.querySelector('[data-testid="reply-cut"]')?.textContent ?? "";
	assert.match(cut, /^Signed in again\. Press Enter to send\./, cut);
	assert.doesNotMatch(host.textContent ?? "", /couldn't reply/);
});
