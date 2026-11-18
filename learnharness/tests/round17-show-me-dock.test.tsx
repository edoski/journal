/**
 * Round 17, m22 (2 m8): after Show me on a practice problem, for the
 * seconds the tutor took to conclude it, the dock still pinned the problem
 * over his draft with the full Answer controls, on a problem already given
 * up. Show me and Explain instead end the problem: while the turn that
 * concludes it runs, the dock holds nothing to answer and the problem
 * reads in the transcript. If that turn ends with the problem still open,
 * the dock holds it again.
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
	const location = new URL("http://localhost/chat/c_showme");
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
const { newUserMessage, newPracticeRequestMessage, newSessionModeMessage } = await import("../src/core/index.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;
type PracticeRequest = import("../src/core/index.ts").PracticeRequest;

const CHAT = "c_showme";
const STATEMENT = "In the space of polynomials of degree at most 2, is the set {1+x, x-x^2, 2+x+x^2} linearly independent, and why?";
const WORK = "coefficients a(1+x) + b(x-x^2) + c(2+x+x^2) = 0 gives a + 2c = 0";

function record(request: PracticeRequest | null): LhMessage[] {
	const posed = {
		id: "a_pose",
		role: "assistant",
		content: [{ type: "toolCall", id: "p1", name: "problem", arguments: { statement: STATEMENT, mode: "recall", modelSolution: "Dependent: 2+x+x^2 = 2(1+x) - (x-x^2)." } }],
		stopReason: "toolUse",
		timestamp: Date.now(),
	} as unknown as LhMessage;
	const ack = { id: "r_pose", role: "toolResult", toolCallId: "p1", toolName: "problem", content: [{ type: "text", text: "Posed." }], details: null, isError: false, timestamp: Date.now() } as unknown as LhMessage;
	return [newSessionModeMessage("practice"), newUserMessage("Next problem please") as LhMessage, posed, ack, ...(request ? [newPracticeRequestMessage("p1", request, WORK)] : [])];
}

const originalFetch = globalThis.fetch;
let root: { unmount(): void; render(node: React.ReactNode): void } | null = null;
let host: HTMLElement | null = null;

function stubFetch(messages: LhMessage[], turnInFlight: boolean) {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 200000 });
		if (url.pathname === `/api/chats/${CHAT}`) return Response.json({ messages, turnInFlight });
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

async function mount(messages: LhMessage[], turnInFlight: boolean) {
	stubFetch(messages, turnInFlight);
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<ServerEventsProvider connect={() => quietSource}>
				<Chat chatId={CHAT} title="Rank practice" initialMessages={messages} initiallyInFlight={turnInFlight} course={{ workspace: "la", title: "Linear Algebra" }} />
			</ServerEventsProvider>,
		),
	);
	await settle();
	return host;
}

// The pin over the box (`prose-quote`) shows only once the problem has
// scrolled out of view, which this page never measures: the problem card's
// open mark stands for the dock holding it.
const dockHolds = (page: HTMLElement) => ({
	open: page.querySelector('[data-testid="prose-problem"][data-open]') !== null,
	showMe: page.querySelector('[data-testid="practice-request-show"]') !== null,
	answerMode: page.querySelector('[data-testid="prose-answer-mode"]') !== null,
});

test("the open problem holds the dock: pinned, with Show me and Answer", async () => {
	const page = await mount(record(null), false);
	assert.deepEqual(dockHolds(page), { open: true, showMe: true, answerMode: true });
});

for (const request of ["show", "explain"] as const) {
	test(`after ${request === "show" ? "Show me" : "Explain instead"}, while the tutor concludes it, the dock invites no answer (round 17, m22)`, async () => {
		const page = await mount(record(request), true);
		assert.deepEqual(dockHolds(page), { open: false, showMe: false, answerMode: false });
		const card = page.querySelector('[data-testid="prose-problem"]');
		assert.ok(card !== null && !card.hasAttribute("data-open"), "the problem reads in the transcript");
		assert.match(card?.textContent ?? "", /linearly independent/);
	});
}

test("a give-up turn that ended with the problem still open gives the dock back", async () => {
	const page = await mount(record("show"), false);
	assert.deepEqual(dockHolds(page), { open: true, showMe: true, answerMode: true });
});
