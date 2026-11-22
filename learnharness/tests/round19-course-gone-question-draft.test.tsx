/**
 * Round 19, M6 (4 major 2), a regression of round 18. Window 2 had a
 * Calculus I review open and was typing in its question's answer box when
 * window 1 deleted Calculus I. The lesson said "This course was deleted. Its
 * lessons stay as history." with no line about his words, and the new lesson
 * box was empty: only the lesson's message box was carried. Now every box
 * of the deleted course's lesson (its message box, an open question's, an
 * open practice problem's) goes to the New lesson box, and the line says so.
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
	const location = new URL("http://localhost/chat/c_calc");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
Object.assign(dom.window, { history: { state: null, replaceState() {}, pushState() {} } });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });

const { createRoot } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { keptWords, NEW_LESSON_BOX, setKeptWindow } = await import("../components/lesson/kept-drafts.ts");
const { LESSON_WORDS } = await import("../components/study-words.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;
type NotifySource = import("../components/server-events.tsx").NotifySource;

const CHAT = "c_calc";
const WORKSPACE = "/s/calculus";
const WORDS = "can we do one more chain rule problem? like d/dx sin(x^3) ";
const question = { id: "a_q", role: "assistant", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: { question: "What is the derivative of $\\cos^2(x^3)$, and why?", correctAnswer: "$-6x^2\\cos(x^3)\\sin(x^3)$", type: "check" } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
const problem = { id: "a_p", role: "assistant", content: [{ type: "toolCall", id: "p1", name: "problem", arguments: { statement: "Differentiate $\\sin(x^3)$.", mode: "recall", modelSolution: "$3x^2\\cos(x^3)$" } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
const posed = { id: "r_p", role: "toolResult", toolCallId: "p1", toolName: "problem", content: [{ type: "text", text: "Posed." }], details: null, isError: false, timestamp: 2 } as unknown as LhMessage;

const originalFetch = globalThis.fetch;
let root: { unmount(): void; render(node: React.ReactNode): void } | null = null;
let host: HTMLElement | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
	localStorage.clear();
});

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

function serve(messages: LhMessage[], listed: { courses: { workspace: string }[] }) {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 200000 });
		if (url.pathname === `/api/chats/${CHAT}`) return Response.json({ messages, turnInFlight: false });
		if (url.pathname === `/api/chats/${CHAT}/marks`) return Response.json({ ok: true, marks: {} });
		if (url.pathname === "/api/jobs") return Response.json({ jobs: [] });
		if (url.pathname === "/api/courses") return Response.json({ available: true, ...listed });
		return Response.json({});
	}) as typeof fetch;
}

function channel() {
	const handlers = new Map<string, (data: string) => void>();
	const source: NotifySource = { close() {}, onOpen() {}, onEvent(name, cb) { handlers.set(name, cb); } };
	return { source, emit: (name: string, data: unknown) => act(async () => handlers.get(name)?.(JSON.stringify(data))) };
}

async function mount(messages: LhMessage[]) {
	setKeptWindow("w-two", { live: ["w-two"] });
	const listed = { courses: [{ workspace: WORKSPACE }] };
	serve(messages, listed);
	const events = channel();
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(
		<ServerEventsProvider connect={() => events.source}>
			<Chat chatId={CHAT} title="Calculus I review" initialMessages={messages} course={{ workspace: WORKSPACE, title: "Calculus I" }} />
		</ServerEventsProvider>,
	));
	await settle();
	return { events, listed };
}

async function type(words: string) {
	const field = host!.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')!;
	await act(async () => {
		Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(field, words);
		field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
	await settle();
}

async function deleteCourse(events: ReturnType<typeof channel>, listed: { courses: { workspace: string }[] }) {
	listed.courses = [];
	await events.emit("courses-changed", { deleted: WORKSPACE });
	await settle();
}

for (const [box, messages] of [
	["an open question's answer box", [question]],
	["an open practice problem's box", [problem, posed]],
] as const) {
	test(`his words in ${box} go to the New lesson box when another window deletes the course, and the line says so (round 19, M6)`, async () => {
		const { events, listed } = await mount([...messages]);
		await type(WORDS);
		assert.ok([...Array(localStorage.length).keys()].some((i) => localStorage.key(i)!.includes(`${CHAT}:`)), "the box keeps his words");
		await deleteCourse(events, listed);
		const line = host!.querySelector('[data-testid="course-gone"]')?.textContent ?? "";
		assert.ok(line.includes(LESSON_WORDS.courseDeleted), line);
		assert.ok(line.includes(LESSON_WORDS.courseDeletedKept), `the line names where his words went: ${line}`);
		assert.equal(keptWords(NEW_LESSON_BOX)?.text, WORDS, "the New lesson box holds them as he typed them");
	});
}
