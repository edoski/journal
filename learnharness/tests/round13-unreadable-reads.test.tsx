/**
 * Round 13, 4 minor 5: the restored-record notice cleared 12.6 s after the
 * record read again. The lesson read the whole course list again on every
 * write of the session, each read the engine running over every course,
 * all at once during a turn. One read runs at a time; the events that come
 * during it ask for one more, and the notice clears with the first read
 * that finds the record readable.
 */

import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { CourseUnreadableLine } from "../components/lesson/course-unreadable.tsx";

const WS = "/study/real-analysis";
const CHAT = "chat_series";

const originalFetch = globalThis.fetch;
let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = "";
	globalThis.fetch = originalFetch;
});

const listing = (unreadable: boolean) => ({ available: true, courses: unreadable ? [] : [{ workspace: WS, title: "Real Analysis" }], unreadable: unreadable ? [{ workspace: WS, title: "Real Analysis", problem: "denied" }] : [], roots: ["/study"] });

describe("a lesson's unreadable-record notice", () => {
	it("reads the course list one read at a time, and clears with the first read that finds the record readable", async () => {
		let readable = false;
		const pending: Array<() => void> = [];
		let open = 0;
		let most = 0;
		globalThis.fetch = ((input: string) => {
			assert.equal(String(input), "/api/courses");
			open++;
			most = Math.max(most, open);
			return new Promise<Response>((resolve) => pending.push(() => { open--; resolve(Response.json(listing(!readable))); }));
		}) as typeof fetch;
		const handlers = new Map<string, (data: string) => void>();
		const source: NotifySource = { close() {}, onOpen() {}, onEvent: (name, cb) => void handlers.set(name, cb) };
		const host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		await act(async () => root!.render(<ServerEventsProvider connect={() => source}><CourseUnreadableLine workspace={WS} /></ServerEventsProvider>));
		const fire = (name: string, payload: unknown) => act(async () => handlers.get(name)!(JSON.stringify(payload)));
		const notice = () => document.querySelector("[data-testid=course-unreadable]");
		await act(async () => pending.shift()!());
		assert.ok(notice(), "the record can't be read");

		readable = true;
		await fire("course-changed", { workspace: WS });
		for (let i = 0; i < 4; i++) await fire("record-changed", { chatId: CHAT });
		assert.equal(pending.length, 1, "one read at a time while the session writes");
		await act(async () => pending.shift()!());
		assert.ok(notice() === null, "the notice clears with the read that finds the record readable");
		assert.equal(pending.length, 1, "one more read covers the writes during it");
		await act(async () => pending.shift()!());
		assert.equal(pending.length, 0, "and no more");
		assert.equal(most, 1, "reads never overlap");
	});
});
