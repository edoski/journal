/**
 * Walking a list with the arrows works one way on every page
 * (`useListWalk`, components/list-walk/use-list-walk.ts; audit 17 Nov
 * 2026, finding 12): on Home's Today, the course page's road and the topic
 * page's sections, Home and End jump to the list's ends, from nothing
 * focused and from a row, and ↑ on the first row leaves for the head's
 * control above the list: Now's row on the course page, the trail's last
 * link on the topic page, You are here on Home's map (round 20, m6). Before,
 * Home and End jumped only on the course page, and the topic page's sections
 * had no walk.
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
import { mount as mountHome, press, unmount as unmountHome } from "./helpers/home-dom.tsx";
import type { CourseMap, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { SplitBody } from "../components/course-page/split/split-course.tsx";
import { courseRead } from "../components/course-page/course-model.ts";
import { HybridTopic } from "../components/unit-inbox/topic-page/hybrid/hybrid-topic.tsx";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over });
const needs = (prerequisite: string, of: string) => ({ kind: "needs" as const, prerequisite: h(prerequisite), topic: h(of) });

const WS = "/study/linear-algebra";
/** Vectors, Span (where he is) and Independence, which Basis builds on. */
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
		topic("independence", "Independence", { level: "assisted", introduced: "2026-11-05" }),
		topic("basis", "Basis"),
	],
	edges: [needs("vectors", "span"), needs("span", "independence"), needs("independence", "basis"), needs("span", "basis"), needs("vectors", "basis")],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: [], lastActiveDaysAgo: 1, newToday: [h("basis")] };

let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	await unmountHome();
	dom.document.body.innerHTML = "";
	(dom.document.activeElement as HTMLElement | null)?.blur();
});

async function mount(node: React.ReactNode) {
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
}

const all = (selector: string) => [...dom.document.querySelectorAll<HTMLElement>(selector)];
const view = () => {
	const read = courseRead({ status: "ready", courses: [COURSE], failed: [], open: [], chats: [] }, WS);
	assert.ok(read.status === "ready");
	return read.view;
};

/** Each page, mounted, with its list's rows top to bottom and the head's control the walk leaves for. */
const pages: { name: string; mount: () => Promise<void>; stops: () => HTMLElement[]; head: () => HTMLElement | null }[] = [
	{ name: "Home's Today", mount: mountHome, stops: () => all('[data-slot="today"] [data-line]'), head: () => dom.document.querySelector<HTMLElement>('[data-slot="home-map-course"][data-shown] a[tabindex="0"]') },
	{
		name: "the course page's road",
		// Arriving puts focus on Now's row; the walk starts from nothing focused here.
		mount: async () => {
			await mount(<SplitBody view={view()} standing={null} busy={false} onContinue={() => {}} />);
			(dom.document.activeElement as HTMLElement | null)?.blur();
		},
		stops: () => all('[data-slot="course-split-list"] button, [data-slot="course-split-list"] a[href]'),
		head: () => dom.document.querySelector<HTMLElement>('[data-slot="course-action"]'),
	},
	{
		name: "the topic page's sections",
		mount: () => mount(<HybridTopic facts={topicFacts({ course: COURSE, topic: MAP.topics[3]!, chats: [], read: { record: null, plans: [] } })} busy={false} onAct={() => {}} onTask={() => {}} />),
		stops: () => all('[data-slot="topic-history"] a[href], [data-slot="topic-history"] button'),
		head: () => all('[data-slot="page-head"] a[href]').at(-1) ?? null,
	},
];

const focused = () => dom.document.activeElement;

describe("arriving on the course page (round 15, 4 free)", () => {
	it("puts his keys on Now's row when nothing held focus, as `c` on Home leaves it", async () => {
		await mount(<SplitBody view={view()} standing={null} busy={false} onContinue={() => {}} />);
		const now = dom.document.querySelector<HTMLElement>('[data-slot="course-action"]');
		assert.ok(now, "Now's row");
		assert.ok(focused() === now, "focus on Now's row, not the page's body");
		const rows = all('[data-slot="course-split-list"] button, [data-slot="course-split-list"] a[href]');
		await press("End");
		assert.ok(focused() === rows.at(-1), "End from Now's row takes the road's last stop");
		now!.focus();
		await press("Home");
		assert.ok(focused() === rows[0], "Home from Now's row takes the first");
	});
});

describe("walking a list with the arrows, one way on every page", () => {
	for (const { name, mount: open, stops, head } of pages) {
		it(`on ${name}: Home and End jump to the list's ends, from nothing focused and from a row`, async () => {
			await open();
			const rows = stops();
			assert.ok(rows.length >= 3, "a list long enough to have a middle");
			await press("End", dom.document.body);
			assert.ok(focused() === rows.at(-1), "End with nothing focused takes the last row");
			await press("Home");
			assert.ok(focused() === rows[0], "Home takes the first");
			await press("ArrowDown");
			assert.ok(focused() === rows[1], "↓ steps");
			await press("End");
			assert.ok(focused() === rows.at(-1), "End from a row takes the last");
			await press("ArrowDown");
			assert.ok(focused() === rows.at(-1), "↓ on the last row stays");
			await press("Escape");
			assert.ok(focused() === dom.document.body, "Esc leaves the walk");
			await press("Home", dom.document.body);
			assert.ok(focused() === rows[0], "Home with nothing focused takes the first");
		});

		it(`on ${name}: ↑ on the first row leaves for the head's control, and ↓ comes back`, async () => {
			await open();
			const rows = stops();
			await press("Home", dom.document.body);
			assert.ok(focused() === rows[0]);
			await press("ArrowUp");
			const control = head();
			if (!control) {
				assert.ok(focused() === rows[0], "with no head to take, ↑ keeps the first row");
				return;
			}
			assert.ok(focused() === control, "↑ on the first row reaches the head's control");
			// Home's head is the map, whose cards walk among themselves first: ↓ comes back once none is below.
			for (let step = 0; step < 20 && focused() !== rows[0]; step++) {
				await press("ArrowDown");
				assert.ok(focused() === rows[0] || (focused() as HTMLElement).matches('[data-slot="home-map-course"] a[data-slot="course-map-node"]'), `↓ walks the map's cards, then the first row: ${(focused() as HTMLElement).outerHTML.slice(0, 120)}`);
			}
			assert.ok(focused() === rows[0], "↓ from the head returns to the first row");
		});
	}
});

/**
 * Round 20, m6 (round 19's m26, 4 minor 5): on Home, ↑ and ↓ stayed on the
 * first Today row, and ↓ from You are here walked the map's cards and never
 * reached the rows; only ⌘J crossed. ↑ on the first row steps onto You are
 * here, and ↓ from the map's last reachable card steps onto the first row.
 */
describe("Home's arrows between the map and Today (round 20, m6)", () => {
	it("↑ on the first row focuses You are here, the shown course's current card", async () => {
		await mountHome();
		await press("Home", dom.document.body);
		await press("ArrowUp");
		const here = focused() as HTMLElement;
		assert.ok(here.matches('[data-slot="home-map-course"][data-shown] a[data-slot="course-map-node"][data-current]'), `You are here takes focus: ${here.outerHTML.slice(0, 160)}`);
	});

	it("↓ from a card with none below it reaches the first row", async () => {
		await mountHome();
		const rows = all('[data-slot="today"] [data-line]');
		const cards = all('[data-slot="home-map-course"][data-shown] a[data-slot="course-map-node"]');
		const last = cards.find((card) => card.querySelector('[data-slot="topic-glyph"]') && !cards.some((other) => other !== card && other.getBoundingClientRect().top > card.getBoundingClientRect().top)) ?? cards.at(-1)!;
		last.focus();
		for (let step = 0; step < 20 && focused() !== rows[0]; step++) await press("ArrowDown");
		assert.ok(focused() === rows[0], "↓ leaves the map for Today's first row");
	});
});
