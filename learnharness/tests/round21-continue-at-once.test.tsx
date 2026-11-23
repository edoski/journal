/**
 * Round 21, m7 (4 minor 2): Continue on Problem sheet 4, a day after he
 * left it, showed "Thinking…" for 36.5 s (load 3.8) before a model turn
 * posted part (c) again with "Your turn, on the question above", while
 * topic-page Resume poses a left question again in 0.7 s with no turn.
 * Continue now writes the step he left the task at, with its text, under
 * the day's divider as the chat page opens, and the tutor runs only on his
 * first message.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, describe, it } from "node:test";

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

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-continue-at-once-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const { createRoot, renderToStaticMarkup } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
type NotifySource = import("../components/server-events.tsx").NotifySource;
const quietSource: NotifySource = { close() {}, onOpen() {}, onEvent() {} };
const { newUserMessage, replyCutOf, resumedOn, sessionEndOf } = await import("../src/core/index.ts");
const { continueHeldTask } = await import("../src/server/chats.ts");
const { rememberTurnFailure, turnFailure } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;
type CourseMap = import("../src/core/index.ts").CourseMap;

const STEP = "Part (c): show $\\dim \\ker A = 2$ for the $3 \\times 5$ matrix $A$";
const LA = { workspace: "/s/la", title: "Linear Algebra" };
const MAP = { workspace: LA.workspace, tasks: [{ key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: STEP, updated: "2026-11-06" }] } as unknown as CourseMap;
const STAMPS = { api: "faux", provider: "test", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stopReason: "toolUse" } as const;
/** Sheet 4's session, as the seed holds it: it opened the task, saved its step and stopped. */
const SHEET_SESSION: LhMessage[] = [
	newUserMessage("Help me start problem sheet 4.") as LhMessage,
	{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "save1", name: "course_save", arguments: { changes: { tasks: { "sheet-4": { title: "Problem sheet 4: rank and nullity", step: STEP } }, focus: "sheet-4" } } }], ...STAMPS, timestamp: 1 } as unknown as LhMessage,
	{ id: "r1", role: "toolResult", toolCallId: "save1", toolName: "course_save", content: [{ type: "text", text: "{}" }], details: null, isError: false, timestamp: 1 } as unknown as LhMessage,
	{ id: "t1", role: "assistant", content: [{ type: "text", text: "Good place to stop. Practice comes next, in a day or two." }], ...STAMPS, stopReason: "stop", timestamp: 2 } as unknown as LhMessage,
];

function sheetChat(): string {
	const created = chatStore.createChat("Problem sheet 4", LA, ["kernel"]);
	chatStore.saveMessages(created.id, SHEET_SESSION);
	return created.id;
}

const originalFetch = globalThis.fetch;
let root: { unmount(): void; render(node: React.ReactNode): void } | null = null;
let host: HTMLElement | null = null;
let posted: unknown[] = [];

/** The app's routes; any turn's POST is counted and held. */
function stubFetch(messages: LhMessage[]) {
	posted = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/chat" && init?.method === "POST") {
			posted.push(JSON.parse(String(init.body)));
			return new Promise<Response>(() => {});
		}
		if (url.pathname === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 200000 });
		if (url.pathname.startsWith("/api/chats/") && url.pathname.endsWith("/marks")) return Response.json({ ok: true, marks: {} });
		if (url.pathname.startsWith("/api/chats/")) return Response.json({ messages, turnInFlight: false });
		if (url.pathname === "/api/jobs") return Response.json({ jobs: [] });
		if (url.pathname === "/api/courses") return Response.json({ available: true, courses: [{ workspace: LA.workspace }] });
		if (url.pathname === "/api/subscriptions/claude") return Response.json({ accounts: [] });
		return Response.json({});
	}) as typeof fetch;
}

afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
});

/** The page as the server draws it a day after he last worked on the sheet. */
const view = (chatId: string, messages: LhMessage[], initialError?: string) => (
	<ServerEventsProvider connect={() => quietSource}>
		<Chat chatId={chatId} title="Problem sheet 4" initialMessages={messages} initialError={initialError} course={LA} resumed={resumedOn(messages, "2026-11-07T20:00:00", "2026-11-08") ?? undefined} />
	</ServerEventsProvider>
);

describe("Continue shows the open part at once and runs no turn (round 21, m7; 4 minor 2)", () => {
	it("the chat opens with part (c) under the day's divider, no Thinking, and no failure from the last turn", async () => {
		const id = sheetChat();
		rememberTurnFailure(id, "Claude Code stopped with an error before it finished.");
		await continueHeldTask(id, async () => [MAP]);
		const record = chatStore.getChat(id)!.messages;
		const marker = record.at(-1)!;
		assert.ok(marker.role === "custom" && marker.customType === "task-continue", "the Continue line is written as the page opens");
		assert.equal(turnFailure(id), undefined, "the remembered failure is not where he picks up (round 18, m25)");
		const html = renderToStaticMarkup(view(id, record, turnFailure(id)));
		assert.match(html, /data-testid="task-continue-line"/, "the part is in the page the server draws");
		assert.match(html, /Part \(c\)/);
		assert.equal(resumedOn(record, "2026-11-07T20:00:00", "2026-11-08")?.before, marker.id, "under the day's divider");
		assert.ok(html.indexOf("8 Nov") >= 0 && html.indexOf("8 Nov") < html.indexOf('data-testid="task-continue-line"'), "the divider sits above the part");
		assert.doesNotMatch(html, /data-testid="thinking-placeholder"/);
		assert.doesNotMatch(html, /stopped before replying/);
	});

	it("no /api/chat runs before he sends", async () => {
		const id = sheetChat();
		await continueHeldTask(id, async () => [MAP]);
		const record = chatStore.getChat(id)!.messages;
		stubFetch(record);
		host = document.createElement("div");
		document.body.append(host);
		root = createRoot(host);
		await act(async () => root!.render(view(id, record)));
		await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
		assert.ok(host.querySelector('[data-testid="task-continue-line"]'), "the part is on screen");
		assert.deepEqual(posted, [], "no turn is asked for");
	});

	it("leaves the session as it stood, owing nothing, and draws once however often he presses", async () => {
		const id = sheetChat();
		const before = chatStore.listChats().find((c) => c.id === id)!;
		await continueHeldTask(id, async () => [MAP]);
		await continueHeldTask(id, async () => [MAP]);
		const record = chatStore.getChat(id)!.messages;
		assert.equal(record.filter((m) => m.role === "custom" && m.customType === "task-continue").length, 1);
		assert.equal(sessionEndOf(record, undefined), sessionEndOf(SHEET_SESSION, undefined), "no reply cut off, nothing new asked");
		assert.equal(replyCutOf(record), null);
		const listed = chatStore.listChats().find((c) => c.id === id)!;
		assert.equal(listed.updatedAt, before.updatedAt, "opening it is not new work, as Resume's question asked again is not");
		assert.equal(listed.ended, before.ended);
	});

	it("his first message runs the tutor, which reads the step as his try's subject", async () => {
		const id = sheetChat();
		await continueHeldTask(id, async () => [MAP]);
		const marker = chatStore.getChat(id)!.messages.at(-1)!;
		const words = marker.role === "custom" ? marker.content : "";
		assert.match(words, /`sheet-4`/);
		assert.match(words, /What I send next is my own try at that step/);
		assert.match(words, /never pose the step again/);
		assert.doesNotMatch(words, /pose the step straight away/);
	});
});
