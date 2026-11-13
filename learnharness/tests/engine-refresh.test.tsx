/**
 * The views of the engine record (Home, the topic sidebar, the calendar)
 * read it again when the record changes (`course-changed`) and when the
 * local day turns over, instead of on a delay after every turn.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { useCalendarRead } from "../components/calendar/use-calendar.ts";
import { useStudyHome } from "../components/study-home/use-study-home.ts";
import { useUnitInbox } from "../components/unit-inbox/use-unit-inbox.ts";
import { msToMidnight } from "../components/day-change.ts";

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
let fetched: string[] = [];

/** Every read answers at once; the test counts them by path. */
function stubFetch() {
	fetched = [];
	globalThis.fetch = (async (input: string) => {
		const url = String(input).split("?")[0]!;
		fetched.push(url);
		if (url === "/api/chats") return Response.json({ chats: [] });
		if (url === "/api/calendar") return Response.json({ available: false, reason: "test" });
		return Response.json({ available: true, courses: [], failed: [] });
	}) as typeof fetch;
}

function channel() {
	const handlers = new Map<string, (data: string) => void>();
	const source: NotifySource = { close() {}, onOpen() {}, onEvent: (name, cb) => void handlers.set(name, cb) };
	return { source, push: (name: string, payload: unknown) => handlers.get(name)?.(JSON.stringify(payload)) };
}

function Views() {
	useCalendarRead();
	useStudyHome();
	useUnitInbox([]);
	return null;
}

async function mount(source: NotifySource) {
	const host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(<ServerEventsProvider connect={() => source}><Views /></ServerEventsProvider>));
}

const reads = () => ({
	calendar: fetched.filter((u) => u === "/api/calendar").length,
	study: fetched.filter((u) => u === "/api/study").length,
});

afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	globalThis.fetch = originalFetch;
	mock.timers.reset();
});

describe("the engine record's views", () => {
	it("read again soon after the record changes, with no turn", async () => {
		stubFetch();
		const { source, push } = channel();
		await mount(source);
		const before = reads();
		await act(async () => push("course-changed", { workspace: "/courses/linalg" }));
		await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
		const after = reads();
		assert.equal(after.calendar, before.calendar + 1, "the calendar");
		assert.equal(after.study, before.study + 2, "Home and the topic sidebar");
	});

	it("read again when the local day turns over", async () => {
		mock.timers.enable({ apis: ["setTimeout", "Date"], now: new Date(2026, 10, 13, 23, 59, 58).getTime() });
		stubFetch();
		const { source } = channel();
		await mount(source);
		const before = reads();
		await act(async () => mock.timers.tick(1500));
		assert.deepEqual(reads(), before, "nothing before midnight");
		await act(async () => mock.timers.tick(1000));
		await act(async () => mock.timers.tick(300));
		const after = reads();
		assert.equal(after.calendar, before.calendar + 1);
		assert.ok(after.study >= before.study + 2);
	});

	it("the next midnight is local", () => {
		assert.equal(msToMidnight(new Date(2026, 10, 13, 23, 0, 0)), 3_600_000);
	});
});
