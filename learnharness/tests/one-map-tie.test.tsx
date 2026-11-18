/**
 * Pointing at a row lights the map beside it one way on every page
 * (`useMapTie`, components/course-map/use-map-tie.ts; audit 17 Nov 2026,
 * finding 11): Home's Today, the course page's road and the topic page's
 * Builds on each light the row's topics, make its card glow and bring it
 * into view, the same marks on the map's cards. Only whether the
 * prerequisite chain lights differs, one flag: the course page lights it,
 * Home and the topic page light the row's topics alone. Before, Home lit
 * and framed but never glowed, the topic page only glowed.
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
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { dom } from "./helpers/radix-dom.ts";
import type { CourseMap, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { StudyHome } from "../components/study-home/study-home.tsx";
import { SplitBody } from "../components/course-page/split/split-course.tsx";
import { courseRead } from "../components/course-page/course-model.ts";
import { HybridTopic } from "../components/unit-inbox/topic-page/hybrid/hybrid-topic.tsx";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { forgetStudyHome } from "../components/study-home/use-study-home.ts";
import { POINT_DWELL_MS } from "../components/course-map/use-map-tie.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over });
const needs = (prerequisite: string, of: string) => ({ kind: "needs" as const, prerequisite: h(prerequisite), topic: h(of) });

const WS = "/study/linear-algebra";
/** Vectors, then Span (where he is), then Independence (which the plan
 *  starts today), then Basis, which builds on both. */
const MAP: CourseMap = {
	workspace: WS,
	title: "Linear Algebra",
	today: "2026-11-08",
	revision: 1,
	exam: null,
	current: h("span"),
	focus: null,
	tasks: [],
	topics: [
		topic("vectors", "Vectors", { level: "retained", introduced: "2026-10-20" }),
		topic("span", "Span", { level: "assisted", introduced: "2026-11-01" }),
		topic("independence", "Independence"),
		topic("basis", "Basis"),
	],
	edges: [needs("vectors", "span"), needs("span", "independence"), needs("independence", "basis"), needs("span", "basis")],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: [], lastActiveDaysAgo: 1, newToday: [h("independence")] };

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
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input).split("?")[0];
		if (url === "/api/study") return Response.json({ available: true, courses: [COURSE], failed: [] });
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
				<SearchParamsContext.Provider value={new URLSearchParams() as never}>
					<ServerEventsProvider connect={() => ({ close() {}, onOpen() {}, onEvent() {} })}>{node}</ServerEventsProvider>
				</SearchParamsContext.Provider>
			</AppRouterContext.Provider>,
		),
	);
	await settle();
}

const fire = (el: Element, type: string) => act(async () => { el.dispatchEvent(new dom.window.Event(type, { bubbles: true })); });

/** Each map card's tie marks: lit, glowing, brought into view. */
function marks() {
	const cards = [...dom.document.querySelectorAll("[data-slot=course-map-node]")];
	const which = (attr: string) => cards.filter((c) => c.hasAttribute(attr)).map((c) => c.getAttribute("data-testid")!.replace("map-node-", "")).sort();
	return { lit: which("data-lit"), glow: which("data-marked"), framed: which("data-framed") };
}

const view = () => {
	const read = courseRead({ status: "ready", courses: [COURSE], failed: [], open: [], chats: [] }, WS);
	assert.ok(read.status === "ready");
	return read.view;
};

/** Each page, mounted, with the row that names Independence. */
const pages: { name: string; page: () => React.ReactNode; row: () => Element | null; chain: boolean }[] = [
	{ name: "Home's Today", page: () => <StudyHome />, row: () => dom.document.querySelector("[data-slot=today-line]"), chain: false },
	{
		name: "the course page's road",
		page: () => <SplitBody view={view()} standing={null} busy={false} onContinue={() => {}} />,
		row: () => [...dom.document.querySelectorAll("[data-slot=course-topic-row]")].find((r) => r.getAttribute("href")?.endsWith("/independence")) ?? null,
		chain: true,
	},
	{
		name: "the topic page's Builds on",
		page: () => <HybridTopic facts={topicFacts({ course: COURSE, topic: MAP.topics[3]!, chats: [], read: { record: null, plans: [] } })} busy={false} onTask={() => {}} />,
		row: () => dom.document.querySelector('[data-slot=pickup-builds-on][data-topic="independence"]'),
		chain: false,
	},
];

describe("pointing at a row lights the map beside it, one way on every page", () => {
	for (const { name, page, row, chain } of pages) {
		it(`on ${name}: focus lights the row's topic, glows its card and brings it into view at once`, async () => {
			await mount(page());
			const target = row();
			assert.ok(target, "the row is drawn");
			assert.deepEqual(marks().framed, [], "nothing framed at rest");
			await fire(target, "focusin");
			const now = marks();
			assert.deepEqual(now.glow, ["independence"]);
			assert.deepEqual(now.framed, ["independence"]);
			assert.ok(now.lit.includes("independence"));
			// Vectors is neither where he is nor next to it: only a chain lights it.
			assert.equal(now.lit.includes("vectors"), chain, chain ? "the course page lights the chain" : "the row's topics alone");
			await fire(target, "focusout");
			assert.deepEqual(marks().framed, []);
		});
	}

	it("the pointer lights once it rests on the row", async () => {
		const { page, row } = pages[1]!;
		await mount(page());
		await fire(row()!, "mouseover");
		assert.deepEqual(marks().glow, [], "not yet");
		await act(async () => { await new Promise((r) => setTimeout(r, POINT_DWELL_MS + 20)); });
		assert.deepEqual(marks().glow, ["independence"]);
	});
});
