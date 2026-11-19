/**
 * Round 18, m19 (4 minor 2). He answered a practice problem and stopped
 * the tutor 3 s in, while it marked him. The record kept the stopped
 * reply's `conclude` call, its arguments never written and never run, and
 * the lesson drew it: a "Model solution" row under his unmarked answer,
 * opening the full working. The box read "Work here, think out loud." and
 * Enter on it sent nothing, though the shortcut sheet lists Enter for Try
 * again. After Try again the mark came with a second Model solution row.
 * Now a conclude that never ran shows nothing, the stopped problem's box
 * says and does what a lesson's does, and each answer has one row.
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
	const location = new URL("http://localhost/chat/c_stopped");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
Object.assign(dom.window, { history: { state: null, replaceState() {}, pushState() {} } });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });

const { createRoot } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { LESSON_WORDS } = await import("../components/study-words.ts");
type NotifySource = import("../components/server-events.tsx").NotifySource;
const quietSource: NotifySource = { close() {}, onOpen() {}, onEvent() {} };
const { newUserMessage, newSessionModeMessage, newThinkingMessage } = await import("../src/core/index.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;

const CHAT = "c_stopped";
const SOLUTION = "The matrix is upper triangular, so its eigenvalues are 3 and 2.";
const at = (n: number) => Date.now() - 10_000 + n;

// Lens 4's record (chat_demo_eigen.json): the pose, his work, the stopped
// reply's conclude with no arguments and no result, then the stop's own
// empty reply.
const stopped: LhMessage[] = [
	newSessionModeMessage("practice"),
	newUserMessage("Problems on eigenvalues") as LhMessage,
	{ id: "a_pose", role: "assistant", content: [{ type: "toolCall", id: "p1", name: "problem", arguments: { statement: "Which lines through the origin does $T$ map onto themselves?", mode: "recall", modelSolution: SOLUTION } }], stopReason: "toolUse", timestamp: at(1) },
	{ id: "r_pose", role: "toolResult", toolCallId: "p1", toolName: "problem", content: [{ type: "text", text: "Posed." }], details: null, isError: false, timestamp: at(2) },
	newThinkingMessage("p1", "triangular, so eigenvalues 3 and 2"),
	{ id: "a_cut", role: "assistant", content: [{ type: "toolCall", id: "c_cut", name: "conclude", arguments: {} }], stopReason: "toolUse", timestamp: at(3) },
	{ id: "a_stop", role: "assistant", content: [], stopReason: "aborted", timestamp: at(4) },
] as unknown as LhMessage[];
// Try again's turn: the conclude that ran, and its closing words.
const retried: LhMessage[] = [
	...stopped,
	{ id: "a_mark", role: "assistant", content: [{ type: "toolCall", id: "c_ok", name: "conclude", arguments: { outcome: "solved", result: "correct" } }], stopReason: "toolUse", timestamp: at(5) },
	{ id: "r_mark", role: "toolResult", toolCallId: "c_ok", toolName: "conclude", content: [{ type: "text", text: "Concluded." }], details: null, isError: false, timestamp: at(6) },
	{ id: "a_words", role: "assistant", content: [{ type: "text", text: "The step easy to miss is that a line kept is an eigenvector." }], stopReason: "stop", timestamp: at(7) },
] as unknown as LhMessage[];

const originalFetch = globalThis.fetch;
let root: { unmount(): void; render(node: React.ReactNode): void } | null = null;
let host: HTMLElement | null = null;
const sent: string[] = [];

function stubFetch(messages: LhMessage[]) {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/chat" && init?.method === "POST") {
			sent.push((JSON.parse(String(init.body)) as { input: { type: string } }).input.type);
			return new Response("ok");
		}
		if (url.pathname === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 200000 });
		if (url.pathname === `/api/chats/${CHAT}`) return Response.json({ messages, turnInFlight: false });
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
	sent.length = 0;
});

async function mount(messages: LhMessage[]) {
	stubFetch(messages);
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<ServerEventsProvider connect={() => quietSource}>
				<Chat chatId={CHAT} title="Eigenvalues and eigenvectors" initialMessages={messages} course={{ workspace: "la", title: "Linear Algebra" }} />
			</ServerEventsProvider>,
		),
	);
	await settle();
	return host;
}

const enter = () => Object.assign(new dom.window.Event("keydown", { bubbles: true, cancelable: true }), { key: "Enter", shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }) as unknown as Event;
const solutionRows = (page: HTMLElement) => (page.textContent?.match(/Model solution/g) ?? []).length;

test("a mark he stopped before it ran shows no model solution under his unmarked answer (round 18, m19)", async () => {
	const page = await mount(stopped);
	assert.equal(solutionRows(page), 0, "no model solution before any mark");
	assert.ok(!page.textContent?.includes(SOLUTION), "the working stays hidden");
});

test("the stopped problem's empty box says Enter tries again, and Enter does (round 18, m19)", async () => {
	const page = await mount(stopped);
	const field = page.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')!;
	assert.equal(field.getAttribute("placeholder"), LESSON_WORDS.tryAgainPlaceholder);
	assert.ok(page.querySelector('[data-testid="practice-request-hint"]') !== null, "the problem is still his to work");
	await act(async () => {
		field.focus();
		field.dispatchEvent(enter());
	});
	await settle();
	assert.deepEqual(sent, ["continue"], "Enter on the empty box runs Try again");
});

test("Enter from outside the box tries again once, and new work in the box goes as his work (round 18, m19)", async () => {
	const page = await mount(stopped);
	await act(async () => {
		dom.window.document.body.dispatchEvent(enter());
	});
	await settle();
	assert.deepEqual(sent, ["continue"], "one Try again, never two");
	sent.length = 0;
	const field = page.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')!;
	await act(async () => {
		Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(field, "the lines y = 0 and x + y = 0");
		field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
	await act(async () => {
		field.dispatchEvent(enter());
	});
	await settle();
	assert.ok(!sent.includes("continue"), `words in the box send them, not Try again: ${sent.join(", ")}`);
});

test("after Try again's mark, the answer has one Model solution row (round 18, m19)", async () => {
	const page = await mount(retried);
	assert.equal(solutionRows(page), 1);
});
