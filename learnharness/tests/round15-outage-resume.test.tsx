/**
 * Round 15, M8 (4 major 4) and m20 (4 minor 3). He sent an answer, the app
 * was killed 5 s in, and while it was down he sent "hello? did that go
 * through?". "Couldn't reach the app" then stood 43 s and more after the
 * restart, with no Try again and no request, and his answer was graded only
 * when he wrote again (`98b`). Through the outage, "Thinking…" and Stop
 * stood under the red line while the box said "Press Enter to try again"
 * (`12c`, `97`). The lesson kept the dead turn's busy fact, so his send went
 * out as a steer, and the steer's failure replaced the dropped turn's line,
 * so the reconnect never healed it. Now a dropped stream ends the busy look,
 * a later failed send keeps the drop's heal pending, and the channel's
 * reconnect runs it: the answer is graded once.
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
	const location = new URL("http://localhost/chat/c_outage");
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

const CHAT = "c_outage";
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

test("a dropped stream, then a send that fails while the app is down, then the app's return: the heal runs, the line clears, and the answer is graded once (round 15, M8; m20)", async () => {
	const app = server();
	const events = channel();
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(
		<ServerEventsProvider connect={() => events.source}>
			<Chat chatId={CHAT} title="Eigen lesson" initialMessages={answered} initiallyInFlight course={{ workspace: "la", title: "Linear Algebra" }} />
		</ServerEventsProvider>,
	));
	await settle();
	assert.ok(app.stream, "the lesson reads the running turn");
	assert.equal(working(), true, "the tutor is grading");

	// The app is killed mid-turn.
	app.up = false;
	await act(async () => app.stream!.error(new TypeError("network error")));
	await settle();
	assert.match(line() ?? "", /connection dropped/);
	assert.equal(working(), false, "no Thinking… under the dropped line (m20, `12c`)");
	assert.equal(stopShown(), false, "no Stop under the dropped line (m20, `97`)");

	// He writes while the app is down.
	await type("hello? did that go through? ");
	await settle();
	assert.equal(app.steers, 0, "his words go as a message, not a steer into the dead turn");
	assert.match(line() ?? "", /reach the app/);
	assert.equal(working(), false);

	// The app is back: the channel reconnects.
	app.up = true;
	const readsBefore = app.reads;
	await events.reconnect();
	await settle();
	assert.ok(app.reads > readsBefore, "the heal asks the app what became of the reply");
	assert.equal(line(), null, `the line clears (${line()})`);
	assert.deepEqual(app.inputs, ["continue"], "the answer is graded once, with no new message of his");
	assert.equal(host!.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')!.value, "hello? did that go through? ", "his words wait in the box");
});

test("a steer that fails while the dropped reply is owed keeps it owed, so the app's return still heals it (round 15, M8)", async () => {
	const { SessionModel, droppedError } = await import("../components/session-core.ts");
	let up = true;
	const m = new SessionModel({
		chatId: CHAT,
		initialMessages: answered,
		fetch: (async (input: RequestInfo | URL) => {
			if (!up) throw new TypeError("Failed to fetch");
			if (String(input).endsWith("/stream")) return new Response(new ReadableStream<Uint8Array>({ start: (c) => c.error(new TypeError("network error")) }));
			return Response.json({ messages: answered, turnInFlight: true });
		}) as typeof fetch,
	});
	const reading = m.resumeStream(false);
	up = false;
	await reading;
	assert.equal(droppedError(m.getState().error), true, "the connection dropped the reply");
	await m.steer("hello? did that go through? ");
	assert.equal(m.getState().error?.message, "Failed to fetch", "the line says the app can't be reached");
	assert.equal(droppedError(m.getState().error), true, "and the dropped reply is still owed");
});
