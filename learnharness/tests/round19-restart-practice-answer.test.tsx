/**
 * Round 19, M3 (4 major 1). In a practice session he answered problem H at
 * Confident, and the app was killed 5 s in, after the tutor's `conclude`
 * had saved his answer (o134) but before the reply was kept. While it was
 * down he typed "hello? did that go through? " and pressed Enter. After
 * the restart the lesson read "The tutor stopped before replying. Try
 * again" and nothing resumed in 5 minutes: unlike an answer to a question,
 * his practice work was a reply never owed by itself. His next Enter sent
 * "hello?" as more work on the problem, which the tutor concluded again
 * (o135). Now practice work whose reply a restart cut resumes by itself,
 * as an answer does: the problem's marking comes once, under his answer
 * (the engine's second conclude only reports the save: P1's hunk), and his
 * words wait in the box for after it.
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
	const location = new URL("http://localhost/chat/c_practice");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
Object.assign(dom.window, { history: { state: null, replaceState() {}, pushState() {} } });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });

const { createRoot } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { newThinkingMessage, newUserMessage } = await import("../src/core/index.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;
type NotifySource = import("../components/server-events.tsx").NotifySource;

const CHAT = "c_practice";
const pose = { id: "a_pose", role: "assistant", content: [{ type: "toolCall", id: "p1", name: "problem", arguments: { statement: "Find the eigenvalues of $H = \\begin{pmatrix} 3 & 1 \\\\ -1 & 1 \\end{pmatrix}$.", mode: "recall", modelSolution: "The characteristic polynomial is $(\\lambda-2)^2$, so $\\lambda = 2$ twice." } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
const posed = { id: "r_pose", role: "toolResult", toolCallId: "p1", toolName: "problem", content: [{ type: "text", text: "Posed." }], details: null, isError: false, timestamp: 2 } as unknown as LhMessage;
const work = newThinkingMessage("p1", "trace 4, det 4, so (λ-2)^2: λ = 2 twice", "confident") as LhMessage;
const answered = [pose, posed, work];
const marked = { id: "a_mark", role: "assistant", content: [{ type: "text", text: "Right: λ = 2, twice." }], stopReason: "stop", timestamp: 3 } as unknown as LhMessage;

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

function server(record: LhMessage[], inFlight: boolean) {
	const s = { up: true, record, inputs: [] as string[], steers: 0, stream: null as ReadableStreamDefaultController<Uint8Array> | null };
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		if (!s.up) throw new TypeError("Failed to fetch");
		const url = new URL(String(input), "http://localhost");
		const method = init?.method ?? "GET";
		if (url.pathname === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 200000 });
		if (url.pathname === `/api/chats/${CHAT}/stream`) {
			if (s.stream === null && inFlight) {
				return new Response(new ReadableStream<Uint8Array>({ start: (c) => { s.stream = c; } }), { headers: { "Content-Type": "text/event-stream" } });
			}
			return new Response('data: {"type":"turn-settled"}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
		}
		if (url.pathname === `/api/chats/${CHAT}`) return Response.json({ messages: s.record, turnInFlight: false });
		if (url.pathname === "/api/chat" && method === "POST") {
			const body = JSON.parse(String(init!.body)) as { input: { type: string } };
			s.inputs.push(body.input.type);
			if (body.input.type === "continue") s.record = [...s.record, marked];
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

const line = () => host!.querySelector('[data-testid="turn-error"]')?.textContent ?? null;
const cut = () => host!.querySelector('[data-testid="reply-cut"]')?.textContent ?? null;

async function mount(messages: LhMessage[], inFlight: boolean, source: NotifySource) {
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(
		<ServerEventsProvider connect={() => source}>
			<Chat chatId={CHAT} title="Eigenvalues practice" initialMessages={messages} initiallyInFlight={inFlight} course={{ workspace: "la", title: "Linear Algebra" }} />
		</ServerEventsProvider>,
	));
	await settle();
}

test("his practice answer, cut by a restart after its save, then a send while the app is down: the app's return resumes the marking once, and his words wait in the box (round 19, M3)", async () => {
	const app = server(answered, true);
	const events = channel();
	await mount(answered, true, events.source);
	assert.ok(app.stream, "the lesson reads the running turn");

	app.up = false;
	await act(async () => app.stream!.error(new TypeError("network error")));
	await settle();
	await type("hello? did that go through? ");
	await settle();
	assert.equal(app.steers, 0);
	assert.match(line() ?? "", /reach the app/);

	app.up = true;
	await events.reconnect();
	await settle();
	assert.equal(line(), null, `the line clears (${line()})`);
	assert.equal(cut(), null, `no "stopped before replying" over a reply that resumes (${cut()})`);
	assert.deepEqual(app.inputs, ["continue"], "the marking resumes once, with no new message of his");
	assert.equal(host!.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')!.value, "hello? did that go through? ", "his words wait in the box");
});

test("a lesson opened after a restart cut his practice answer's reply resumes it by itself (round 19, M3)", async () => {
	const app = server(answered, false);
	const events = channel();
	await mount(answered, false, events.source);
	assert.deepEqual(app.inputs, ["continue"], "the marking resumes, as an answer to a question does");
});

test("a plain message whose reply a restart cut still waits for Try again", async () => {
	const lost = [pose, posed, marked, newUserMessage("what does the trace tell me?") as LhMessage];
	const app = server(lost, false);
	const events = channel();
	await mount(lost, false, events.source);
	assert.deepEqual(app.inputs, [], "nothing runs by itself");
	assert.match(cut() ?? "", /stopped before replying/);
});
