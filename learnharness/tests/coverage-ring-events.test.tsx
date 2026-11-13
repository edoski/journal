/**
 * The coverage ring drains batch by batch while a run is in flight: each
 * merged batch announces `coverage-changed` for its chat, and the ring
 * re-reads on it instead of polling every 2 s.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { CoverageRing } from "../components/extraction-coverage.tsx";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	window: dom.window,
	document: dom.document,
	Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement,
	CustomEvent: dom.window.CustomEvent,
	IS_REACT_ACT_ENVIRONMENT: true,
	localStorage: { getItem: () => null, setItem() {} },
});

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
	await act(async () => root?.unmount());
	globalThis.fetch = originalFetch;
});

it("re-reads the session's coverage when a batch of its run merges, and only then", async () => {
	let coverageReads = 0;
	globalThis.fetch = (async (input: string) => {
		if (String(input).startsWith("/api/chats/")) {
			coverageReads++;
			return Response.json({ coverage: { totalMessages: 5, coveredCount: 0, uncoveredCount: 5, coveredTokens: 0, uncoveredTokens: 5000, running: true, lastFoldedAt: null } });
		}
		return Response.json({});
	}) as typeof fetch;
	const handlers = new Map<string, (data: string) => void>();
	const source: NotifySource = { close() {}, onOpen() {}, onEvent: (name, cb) => void handlers.set(name, cb) };
	const host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(<ServerEventsProvider connect={() => source}><CoverageRing chatId="chat_a" /></ServerEventsProvider>));
	const before = coverageReads;
	await act(async () => handlers.get("coverage-changed")?.(JSON.stringify({ chatId: "chat_b" })));
	await act(async () => handlers.get("coverage-changed")?.(JSON.stringify({ chatId: "chat_a" })));
	await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
	assert.equal(coverageReads, before + 1);
});
