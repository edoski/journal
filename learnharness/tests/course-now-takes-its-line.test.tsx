/**
 * The course page's Now takes up the step its line names, as Home's row for
 * the same line does (audit 17 Nov 2026, finding 9's leftover): Home and the
 * course page take a line through one function (`takeLine`,
 * components/start/use-lesson-start.ts). Before, the course page dropped
 * the line's step and took up the course's first step (`nextStepOf`), so
 * Now, reading "Start Eigenvalues", opened the open task instead.
 */
import "./helpers/radix-dom.ts";
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
// Next's Link schedules its prefetch on `self`, which the test DOM lacks.
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true, writable: true });
Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { dom } from "./helpers/radix-dom.ts";
import type { ArcHandle, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { CourseFrame } from "../components/course-page/course-frame.tsx";
import { CourseNow } from "../components/course-page/course-head/course-now.tsx";
import { HomeFrame } from "../components/study-home/home-frame.tsx";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { nextStepOf } from "../components/study-home/study-facts.ts";
import { columnsOf } from "./helpers/course-columns.ts";
import { forgetStudyHome } from "../components/study-home/use-study-home.ts";

const h = (handle: string) => handle as TopicHandle;
const a = (handle: string) => handle as ArcHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title, level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });
const WS = "/study/linear-algebra";

/** An open problem sheet (the course's first step) and Eigenvalues, which
 *  the plan starts today, so Today puts Eigenvalues first. */
const course: StudyCourse = {
	map: {
		workspace: WS,
		title: "Linear Algebra",
		today: "2026-11-08",
		revision: 1,
		exam: null,
		current: h("rank"),
		focus: "sheet",
		tasks: [{ key: "sheet", title: "Problem sheet 4", step: "Question 2", updated: "2026-11-07" }],
		topics: [topic("rank", "Rank", { arc: a("maps") }), topic("eigen", "Eigenvalues", { level: "new", introduced: null, arc: a("spectra") })],
		edges: [],
		arcs: [
			{ handle: a("maps"), title: "Linear maps", state: "learning", entry: [] },
			{ handle: a("spectra"), title: "Spectra", state: "new", entry: [] },
		],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 1,
	newToday: [h("eigen")],
};

let created: { title: string; topics?: string[] }[] = [];
const originalFetch = globalThis.fetch;
let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	dom.document.body.innerHTML = "";
	globalThis.fetch = originalFetch;
	forgetStudyHome();
});

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

async function mount(node: React.ReactNode) {
	created = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input).split("?")[0];
		if (url === "/api/study") return Response.json({ available: true, courses: [course], failed: [] });
		if (url === "/api/course-standing") return Response.json({ ok: true, standing: { readiness: null, mistakes: [] } });
		if (url === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 8192 });
		if (url === "/api/chats" && init?.method === "POST") {
			created.push(JSON.parse(String(init.body)) as { title: string; topics?: string[] });
			return Response.json({ id: "chat_opened" });
		}
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
				<ServerEventsProvider connect={() => ({ close() {}, onOpen() {}, onEvent() {} })}>{node}</ServerEventsProvider>
			</AppRouterContext.Provider>,
		),
	);
	await settle();
}

async function press(selector: string) {
	const target = dom.document.querySelector(selector);
	assert.ok(target, `${selector} is drawn`);
	await act(async () => { target.dispatchEvent(new dom.window.Event("click", { bubbles: true })); });
	await settle();
}

describe("the course page's Now takes up its line's step, as Home's row does", () => {
	it("the fixture's line names a step other than the course's first", () => {
		assert.equal(nextStepOf(course).kind, "task");
	});

	it("Home's row starts Eigenvalues", async () => {
		await mount(<HomeFrame className="">{({ rows, busy, onContinue }) => <HybridRows rows={rows} busy={busy} onContinue={onContinue} />}</HomeFrame>);
		await press("[data-slot=today-line]");
		assert.deepEqual(created.map((c) => [c.title, c.topics]), [["Start Eigenvalues", ["eigen"]]]);
	});

	it("the course page's Now starts the same lesson", async () => {
		await mount(<CourseFrame workspace={WS}>{({ view, standing, busy, onContinue }) => <CourseNow {...columnsOf(view, standing, { busy, onContinue })} />}</CourseFrame>);
		await press("[data-slot=course-action]");
		assert.deepEqual(created.map((c) => [c.title, c.topics]), [["Start Eigenvalues", ["eigen"]]]);
	});
});
