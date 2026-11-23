/**
 * Round 20, m15 (4 minor 3). Calculus I deleted from window 1 while window
 * 2 showed its review: Back in window 2 showed the review with a live
 * "Your answer" box for about 3 s, and the sidebar listed only Linear
 * Algebra's rows under "Couldn't read your courses" for over 10 s, at load
 * 67 to 83. A courses read the app could not answer replaced the last
 * list; it now keeps it and is asked once more. And Back serves the page
 * from before the delete, so the lesson reads the deletion this window
 * heard and opens as history from its first frame.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { deletedInThisWindow, ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { useUnitInbox, type InboxState } from "../components/unit-inbox/use-unit-inbox.ts";

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
	root = undefined;
	globalThis.fetch = originalFetch;
});

const LA = { workspace: "/study/linear-algebra", title: "Linear Algebra", problem: "denied" };
const PR = { workspace: "/study/probability", title: "Probability", problem: "denied" };

function channel() {
	const handlers = new Map<string, (data: string) => void>();
	const source: NotifySource = { close() {}, onOpen() {}, onEvent: (name, cb) => void handlers.set(name, cb) };
	return { source, push: (name: string, payload: unknown) => act(async () => handlers.get(name)?.(JSON.stringify(payload))) };
}

let seen: InboxState | null = null;
function Sidebar() {
	seen = useUnitInbox([]).state;
	return null;
}

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

describe("the sidebar's courses right after a delete", () => {
	it("a read the app could not answer keeps the last list, says nothing failed, and is asked once more", async () => {
		const answers = [
			{ available: true, courses: [], failed: [LA, PR] },
			{ available: false, reason: "The learning engine could not start" },
			{ available: true, courses: [], failed: [LA, PR] },
		];
		let reads = 0;
		globalThis.fetch = (async () => Response.json(answers[Math.min(reads++, answers.length - 1)])) as unknown as typeof fetch;
		const { source, push } = channel();
		const host = document.createElement("div");
		document.body.append(host);
		root = createRoot(host);
		await act(async () => root!.render(<ServerEventsProvider connect={() => source}><Sidebar /></ServerEventsProvider>));
		await settle();
		assert.equal(seen?.status === "ready" && seen.unreadable.length, 2);
		await push("courses-changed", { deleted: "/study/calculus" });
		await settle();
		assert.equal(reads, 3, "the read the app could not answer is asked once more");
		assert.ok(seen?.status === "ready" && !seen.unavailable, "no \"Couldn't read your courses\"");
		assert.equal(seen?.status === "ready" && seen.unreadable.length, 2, "the last list stays");
	});

	it("a deletion the window heard is known to a lesson page opened after it", async () => {
		globalThis.fetch = (async () => Response.json({ available: true, courses: [], failed: [] })) as unknown as typeof fetch;
		const { source, push } = channel();
		const host = document.createElement("div");
		document.body.append(host);
		root = createRoot(host);
		await act(async () => root!.render(<ServerEventsProvider connect={() => source}><Sidebar /></ServerEventsProvider>));
		assert.equal(deletedInThisWindow("/study/calculus-1"), false);
		await push("courses-changed", { deleted: "/study/calculus-1" });
		assert.equal(deletedInThisWindow("/study/calculus-1"), true);
		assert.equal(deletedInThisWindow("/study/probability"), false);
	});
});
