/**
 * Round 17, M8 (2 D1): Continue on Problem sheet 4 showed "Thinking…" for
 * 42 s, then "Planning the lesson…", and only at 47.6 s (load 6.6) the part
 * he had left: "Part (c) of the further problem on sheet 4. Your turn…".
 * The sheet's 6 Nov session posed no part (c) before it stopped, so there
 * is no question to ask again as Resume does; the part lives in the task's
 * record, as its step. Continue now draws the task's title and that step
 * the moment he presses, from the map the page read, and the record's
 * marker keeps them for a reload; the tutor's turn writes the part out
 * behind them, its input unchanged.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

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
	const location = new URL("http://localhost/chat/c_sheet4");
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
const { continuedTaskOf, inputAppends, newUserMessage, parseChatInput, projectView } = await import("../src/core/index.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;
type CourseMapTask = import("../src/core/index.ts").CourseMapTask;

const CHAT = "c_sheet4";
const STEP = "Part (c): show $\\dim \\ker A = 2$ for the $3 \\times 5$ matrix $A$";
const SHEET: CourseMapTask = { key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: STEP, updated: "2026-11-06" };
const TASK = { title: SHEET.title, step: STEP };

const STAMPS = { api: "faux", provider: "test", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stopReason: "toolUse" } as const;
/** Sheet 4's 6 Nov session, as the seed holds it: it opened the task, saved its step and stopped. */
const SHEET_SESSION: LhMessage[] = [
	newUserMessage("Help me start problem sheet 4.") as LhMessage,
	{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "save1", name: "course_save", arguments: { changes: { tasks: { "sheet-4": { title: SHEET.title, step: STEP } }, focus: "sheet-4" } } }], ...STAMPS, timestamp: 1 } as unknown as LhMessage,
	{ id: "r1", role: "toolResult", toolCallId: "save1", toolName: "course_save", content: [{ type: "text", text: "{}" }], details: null, isError: false, timestamp: 1 } as unknown as LhMessage,
	{ id: "t1", role: "assistant", content: [{ type: "text", text: "Good place to stop. Practice comes next, in a day or two." }], ...STAMPS, stopReason: "stop", timestamp: 2 } as unknown as LhMessage,
];

const originalFetch = globalThis.fetch;
let root: { unmount(): void; render(node: React.ReactNode): void } | null = null;
let host: HTMLElement | null = null;
let posted: unknown[] = [];

/** The app's routes; the turn's POST is held, so nothing the model writes ever arrives. */
function stubFetch(messages: LhMessage[]) {
	posted = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/chat" && init?.method === "POST") {
			posted.push(JSON.parse(String(init.body)));
			return new Promise<Response>(() => {});
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
});

async function mount(messages: LhMessage[], continueTask: boolean) {
	stubFetch(messages);
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<ServerEventsProvider connect={() => quietSource}>
				<Chat chatId={CHAT} title="Problem sheet 4" initialMessages={messages} course={{ workspace: "la", title: "Linear Algebra" }} place={{ topic: { handle: "kernel", title: "Kernel and rank-nullity" }, arc: null, task: continuedTaskOf({ tasks: [SHEET] }, messages) }} continueTask={continueTask} />
			</ServerEventsProvider>,
		),
	);
	await settle();
	return host;
}

/** The line's words, its formulas read back as their TeX. */
const lineWords = (page: HTMLElement) => {
	const line = page.querySelector('[data-testid="task-continue-line"]');
	if (!line) return null;
	const copy = line.cloneNode(true) as Element;
	for (const math of copy.querySelectorAll(".katex")) math.replaceWith(copy.ownerDocument.createTextNode(`$${math.querySelector("annotation")?.textContent ?? ""}$`));
	return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
};

describe("Continue on a task shows the part he left at once (round 17, M8: 2 D1)", () => {
	it("the page names the session's open task as the map does", () => {
		assert.deepEqual(continuedTaskOf({ tasks: [SHEET] }, SHEET_SESSION), TASK);
		assert.equal(continuedTaskOf({ tasks: [] }, SHEET_SESSION), null, "a map without the task names none");
		assert.equal(continuedTaskOf(undefined, SHEET_SESSION), null);
	});

	it("Continue on sheet 4 puts Part (c) on screen before any model output", async () => {
		const page = await mount(SHEET_SESSION, true);
		assert.equal(posted.length, 1, "the press asks for the task's turn");
		assert.equal((posted[0] as { input?: { type?: string } }).input?.type, "task");
		const words = lineWords(page);
		assert.ok(words !== null, "the Continue line is drawn while the turn's POST is still unanswered");
		assert.match(words, /Problem sheet 4: rank and nullity/);
		assert.match(words, /Part \(c\): show \$\\dim \\ker A = 2\$/);
		assert.equal(page.querySelectorAll('[data-testid="task-continue-line"]').length, 1);
	});

	it("the record's marker keeps the task's title and step, so a reload draws the same line", async () => {
		const appends = inputAppends({ messages: SHEET_SESSION }, { type: "task", task: TASK });
		const marker = appends.at(-1)!;
		assert.ok(marker.role === "custom" && marker.customType === "task-continue");
		assert.deepEqual(marker.details, { tasks: ["sheet-4"], ...TASK });
		const view = projectView([...SHEET_SESSION, ...appends]).at(-1)!;
		assert.ok(view.role === "user" && view.parts.every((p) => p.type === "data-task-continue"), "never his bubble");
		const page = await mount([...SHEET_SESSION, ...appends], false);
		assert.equal(posted.length, 0, "opening it to read asks for nothing");
		assert.match(lineWords(page) ?? "", /Part \(c\)/);
	});

	it("the model's input is the same with the task's record or without it", () => {
		const content = (task?: typeof TASK) => {
			const marker = inputAppends({ messages: SHEET_SESSION }, { type: "task", task }).at(-1)!;
			return marker.role === "custom" ? marker.content : null;
		};
		assert.equal(content(TASK), content());
	});

	it("a client's task record never reaches the server's marker", () => {
		assert.deepEqual(parseChatInput({ type: "task", task: { title: "Anything", step: "Part (z)" } }), { type: "task" });
	});
});
