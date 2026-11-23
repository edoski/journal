/**
 * Round 20, m12 (4 minor 2). He sent an answer just after a turn ended,
 * and the app was killed 4 s in, before any response: "Couldn't reach the
 * app. Check it's running, then try again." stood for 30 s and more after
 * the restart. The channel's reconnect healed only a dropped stream. Now,
 * when the app answers again, a send that could not reach it says so:
 * "The app is back. Press Enter to send.", with his words in the box.
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
	const location = new URL("http://localhost/chat/c_back");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
Object.assign(dom.window, { history: { state: null, replaceState() {}, pushState() {} } });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });

const { createRoot } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { buildAnswer, newAnswerResult } = await import("../src/core/index.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;
type NotifySource = import("../components/server-events.tsx").NotifySource;

const CHAT = "c_back";
const question = { id: "a_q", role: "assistant", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: { question: "What is $D$?" } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
const answer = buildAnswer({ id: "q1", kind: "explain", question: "What is $D$?", mode: "text", options: [], createdAt: "fixture" }, { text: "D = diag(1, 3)" });
const answered = [question, newAnswerResult("q1", "explain", answer)];
const graded = { id: "a_graded", role: "assistant", content: [{ type: "text", text: "Right: the eigenvalues sit on the diagonal." }], stopReason: "stop", timestamp: 2 } as unknown as LhMessage;

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

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

function server() {
	const s = {
		up: true,
		record: answered as LhMessage[],
		inputs: [] as string[],
		reads: 0,
		steers: 0,
		stream: null as ReadableStreamDefaultController<Uint8Array> | null,
	};
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		if (!s.up) throw new TypeError("Failed to fetch");
		const url = new URL(String(input), "http://localhost");
		const method = init?.method ?? "GET";
		if (url.pathname === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 200000 });
		if (url.pathname === `/api/chats/${CHAT}/stream`) {
			if (s.stream === null) {
				return new Response(new ReadableStream<Uint8Array>({ start: (c) => { s.stream = c; } }), { headers: { "Content-Type": "text/event-stream" } });
			}
			return new Response('data: {"type":"turn-settled"}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
		}
		if (url.pathname === `/api/chats/${CHAT}`) {
			s.reads++;
			return Response.json({ messages: s.record, turnInFlight: false });
		}
		if (url.pathname === "/api/chat" && method === "POST") {
			const body = JSON.parse(String(init!.body)) as { input: { type: string } };
			s.inputs.push(body.input.type);
			if (body.input.type === "continue") s.record = [...answered, graded];
			return new Response("ok");
		}
		if (url.pathname === `/api/chats/${CHAT}/steer`) {
			s.steers++;
			return new Response("ok");
		}
		if (url.pathname === `/api/chats/${CHAT}/marks`) return Response.json({ ok: true, marks: {} });
		if (url.pathname === "/api/jobs") return Response.json({ jobs: [] });
		if (url.pathname === "/api/courses") return Response.json({ available: true, courses: [{ workspace: "la" }] });
		return Response.json({});
	}) as typeof fetch;
	return s;
}

function channel() {
	let open: () => void = () => {};
	const source: NotifySource = { close() {}, onOpen(cb) { open = cb; }, onEvent() {} };
	return { source, reconnect: () => act(async () => open()) };
}

async function type(words: string) {
	const field = host!.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')!;
	await act(async () => {
		Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(field, words);
		field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
	await act(async () => {
		host!.querySelector("form[data-testid=composer]")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
	});
}

const working = () => host!.querySelector('[data-testid="thinking-placeholder"]') !== null;
const stopShown = () => host!.querySelector('[data-slot="composer-send"][aria-label="Stop"]') !== null;
const line = () => host!.querySelector('[data-testid="turn-error"]')?.textContent ?? null;

test("a send that couldn't reach the app: when the app answers again, the line says he can send now", async () => {
	const app = server();
	app.record = [...answered, graded];
	const events = channel();
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(
		<ServerEventsProvider connect={() => events.source}>
			<Chat chatId={CHAT} title="Eigen lesson" initialMessages={[...answered, graded]} course={{ workspace: "la", title: "Linear Algebra" }} />
		</ServerEventsProvider>,
	));
	await settle();
	app.up = false;
	await type("so the eigenvalues are 1 and 3");
	await settle();
	assert.match(line() ?? "", /reach the app/);

	app.up = true;
	await events.reconnect();
	await settle();
	assert.equal(line(), null, "the offline line is gone");
	assert.equal(host!.querySelector('[data-testid="app-back"]')?.textContent, "The app is back. Press Enter to send.");
	assert.equal(host!.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')!.value, "so the eigenvalues are 1 and 3", "his words wait in the box");
});
