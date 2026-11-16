/**
 * Home shows the last Home it read while a visit's read is under way
 * (round 12, 1 m8): after the 9 Nov Poisson close, Home sat on "Reading
 * your courses…" for over a minute while the engine was busy with the
 * lesson's background work.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { forgetStudyHome, useStudyHome, type StudyHomeState } from "../components/study-home/use-study-home.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;
after(() => {
	globalThis.fetch = originalFetch;
	forgetStudyHome();
});

const source: NotifySource = { close() {}, onOpen() {}, onEvent() {} };
const seen: StudyHomeState["status"][] = [];
function Home() {
	seen.push(useStudyHome().state.status);
	return null;
}

/** /api/study answers at once, or never (a busy engine). */
function study(answers: boolean) {
	globalThis.fetch = (async (input: string) => {
		if (String(input).startsWith("/api/chats")) return Response.json({ chats: [] });
		return answers ? Response.json({ available: true, courses: [], failed: [] }) : new Promise<Response>(() => {});
	}) as typeof fetch;
}

async function visit() {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => root.render(<ServerEventsProvider connect={() => source}><Home /></ServerEventsProvider>));
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
	return root;
}

describe("Home on a visit while the engine is busy (1 m8)", () => {
	it("shows the last Home it read, never Reading your courses…, until the visit's read lands", async () => {
		forgetStudyHome();
		study(true);
		const first = await visit();
		assert.equal(seen.at(-1), "ready");
		await act(async () => first.unmount());
		seen.length = 0;
		study(false);
		const second = await visit();
		try {
			assert.deepEqual([...new Set(seen)], ["ready"], "the last Home, at once and throughout");
		} finally {
			await act(async () => second.unmount());
		}
	});
});
