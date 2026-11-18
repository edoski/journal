/**
 * Every page says it is reading, or that the engine is down, one way
 * (`PageNotice`, components/page-frame/page-frame.tsx; audit 17 Nov 2026,
 * finding 10): the same part in the frame's first row with the same words
 * on Home, the course page, the topic page and the calendar. Before, a slow
 * read showed a head skeleton on the course page, "Loading…" on the topic
 * page, and "Reading your courses…" top left on Home and centred on the
 * calendar; with the engine down the course page had a sentence of its own.
 */
import "./helpers/radix-dom.ts";
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
// Next's Link schedules its prefetch on `self`, which the test DOM lacks.
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true, writable: true });
Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { dom } from "./helpers/radix-dom.ts";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { HomeFrame } from "../components/study-home/home-frame.tsx";
import { CourseFrame } from "../components/course-page/course-frame.tsx";
import { UnitPage } from "../components/unit-inbox/unit-page.tsx";
import { CalendarPage } from "../components/calendar/calendar-page.tsx";
import { forgetStudyHome } from "../components/study-home/use-study-home.ts";

const WS = "/study/linear-algebra";
const DOWN = { available: false, reason: "The learning engine could not start: spawn ENOENT" };

const pages: { name: string; page: () => React.ReactNode }[] = [
	{ name: "Home", page: () => <HomeFrame className="">{() => null}</HomeFrame> },
	{ name: "the course page", page: () => <CourseFrame workspace={WS}>{() => null}</CourseFrame> },
	{ name: "the topic page", page: () => <UnitPage workspace={WS} handle="rank" /> },
	{ name: "the calendar", page: () => <CalendarPage /> },
];

const originalFetch = globalThis.fetch;
let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	dom.document.body.innerHTML = "";
	globalThis.fetch = originalFetch;
	forgetStudyHome();
});

/** The page with the engine's reads answered by `engine` (never, while reading). */
async function mount(page: React.ReactNode, engine: () => Promise<Response>) {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input).split("?")[0];
		if (url === "/api/study" || url === "/api/calendar" || url === "/api/course-standing") return engine();
		if (url === "/api/chats") return Response.json({ chats: [] });
		return new Response("{}", { status: 404 });
	}) as typeof fetch;
	const host = dom.document.createElement("div");
	dom.document.body.appendChild(host);
	root = createRoot(host);
	const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
	await act(async () =>
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close() {}, onOpen() {}, onEvent() {} })}>{page}</ServerEventsProvider>
			</AppRouterContext.Provider>,
		),
	);
	await act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });
}

/** The page's one notice: the frame it sits in and its words. */
function notice() {
	const parts = dom.document.querySelectorAll("[data-slot=page-notice]");
	assert.equal(parts.length, 1, "one notice");
	const part = parts[0]!;
	assert.ok(part.parentElement?.getAttribute("data-slot") === "page-frame", "in the page frame");
	assert.ok(part.parentElement?.firstElementChild === part, "its first row");
	return part.textContent;
}

async function noticesWhile(engine: () => Promise<Response>) {
	const said: string[] = [];
	for (const { page } of pages) {
		await mount(page(), engine);
		said.push(notice() ?? "");
		await act(async () => root?.unmount());
		root = null;
		dom.document.body.innerHTML = "";
		forgetStudyHome();
	}
	return said;
}

describe("every page's notice is one part with the same words", () => {
	it("while it reads", async () => {
		const said = await noticesWhile(() => new Promise<Response>(() => {}));
		assert.deepEqual(said, pages.map(() => "Reading your courses…"));
	});

	it("when the engine is down", async () => {
		const said = await noticesWhile(async () => Response.json(DOWN));
		assert.match(said[0]!, /could not start/);
		assert.deepEqual(said, pages.map(() => said[0]));
	});
});
