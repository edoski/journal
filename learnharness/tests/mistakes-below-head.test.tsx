/**
 * Mistakes on Linear Algebra's course page (round 9, 2 m2: the popover
 * hung from the press and covered the head's lines). The head is laid out
 * as his 1512×982 window draws it, and the popover must open below every
 * one of the head's lines.
 */

import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
// Next's Link schedules its prefetch on `self`, which the test DOM lacks.
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true, writable: true });
Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CourseMapTopic, CourseStanding, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { CourseFrame } from "../components/course-page/course-frame.tsx";
import { CourseHead } from "../components/course-page/course-head/course-head.tsx";
import { columnsOf } from "./helpers/course-columns.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title, level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });
const WS = "/study/linear-algebra";
/** Linear Algebra's demo topics not yet solid, in path order. */
const NOT_YET = [
	topic("independence", "Linear independence"),
	topic("matmul", "Matrix multiplication as composition", { signals: { ...QUIET, mistake: true } }),
	topic("gauss", "Gaussian elimination", { signals: { ...QUIET, mistake: true } }),
	topic("rank", "Rank and the column space"),
	topic("kernel", "Kernel and rank-nullity"),
	topic("det", "Determinants as volume scaling"),
	topic("cramer", "Cramer's rule"),
	topic("eigen", "Eigenvalues and eigenvectors", { signals: { ...QUIET, mistake: true } }),
];
const course: StudyCourse = {
	map: {
		workspace: WS,
		title: "Linear Algebra",
		today: "2026-11-08",
		revision: 1,
		exam: { date: "2026-12-03", daysLeft: 25 },
		current: h("eigen"),
		focus: null,
		tasks: [],
		topics: [topic("span", "Span", { level: "retained" }), ...NOT_YET],
		edges: [],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	newToday: [],
};
const standing: CourseStanding = {
	readiness: { date: "2026-12-03", daysLeft: 25, parts: [{ solid: [h("span")], notYet: NOT_YET.map((t) => t.handle), toStart: [], wontFit: [] }] },
	mistakes: [
		{ topic: h("eigen"), gap: null, latest: "2026-11-08", answers: [{ id: "o40", date: "2026-11-08", text: "Explained why an eigenvector stays on its own line under $A$", response: null, result: "partial", helped: true, confident: false, chose: null, on: null }] },
		{ topic: h("matmul"), gap: "Multiplied a $2 \\times 3$ by a $3 \\times 2$ matrix and gave a $3 \\times 3$ result", latest: "2026-11-05", answers: [] },
		{ topic: h("gauss"), gap: "Reached for Cramer's rule on a $4 \\times 4$ system", latest: "2026-11-05", answers: [] },
	],
};

/** Where his window draws the head (CSS px at 1512×982): the title row
 *  with the actions at its right, the readiness line on two rows across
 *  the whole head, the facts row, and the head's bottom edge. */
type Box = { top: number; left: number; width: number; height: number };
const LAYOUT: Record<string, Box> = {
	"page-head": { top: 24, left: 280, width: 1208, height: 82 },
	"course-mistakes": { top: 24, left: 1221, width: 92, height: 32 },
	"page-standing": { top: 61, left: 280, width: 1208, height: 20 },
};
const POPOVER = { width: 320, height: 240 };
const rect = ({ top, left, width, height }: Box) => ({ top, left, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON() {} }) as DOMRect;
/** The box the popover's positioner measures and moves. */
const floating = (el: Element) => el.hasAttribute("data-radix-popper-content-wrapper");
const proto = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
proto.getBoundingClientRect = function (this: Element) {
	const box = LAYOUT[this.getAttribute("data-slot") ?? ""];
	if (box) return rect(box);
	if (floating(this)) return rect({ top: 0, left: 0, ...POPOVER });
	return rect({ top: 0, left: 0, width: 0, height: 0 });
};
for (const [key, size] of [["offsetWidth", "width"], ["offsetHeight", "height"]] as const) {
	Object.defineProperty(proto, key, { configurable: true, get(this: Element) { return floating(this) ? POPOVER[size] : 0; } });
}
// The window the positioner keeps the popover inside.
Object.assign(dom.window, { innerWidth: 1512, innerHeight: 982, devicePixelRatio: 1 });
Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1512 });
Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 982 });

const originalFetch = globalThis.fetch;
let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = "";
	globalThis.fetch = originalFetch;
});

async function mountHead() {
	globalThis.fetch = ((input: string) => {
		const url = String(input).split("?")[0];
		if (url === "/api/study") return Promise.resolve(Response.json({ available: true, courses: [course], failed: [] }));
		if (url === "/api/course-standing") return Promise.resolve(Response.json({ ok: true, standing }));
		if (url === "/api/chats") return Promise.resolve(Response.json({ chats: [] }));
		return Promise.resolve(Response.json({ available: false, reason: "test" }));
	}) as typeof fetch;
	const host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
	await act(async () =>
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close() {}, onOpen() {}, onEvent() {} })}>
					<CourseFrame workspace={WS}>{({ view, standing: known, busy, onContinue }) => <CourseHead {...columnsOf(view, known, { busy, onContinue })} />}</CourseFrame>
				</ServerEventsProvider>
			</AppRouterContext.Provider>,
		),
	);
	for (let i = 0; i < 5; i++) await act(async () => {});
}

/** The popover's top edge, from the offset its positioner sets. */
function popoverTop(): number {
	const wrapper = document.querySelector("[data-radix-popper-content-wrapper]") as HTMLElement | null;
	assert.ok(wrapper, "the popover opened");
	const match = /translate\(([-\d.NaN]+)px, ([-\d.]+)px\)/.exec(wrapper.style.transform);
	assert.ok(match, `the popover is placed: ${wrapper.style.transform}`);
	return Number(match[2]);
}

describe("Mistakes opens under the head", () => {
	it("covers none of the head's lines", async () => {
		await mountHead();
		const press = document.querySelector("[data-slot=course-mistakes]");
		assert.ok(press, "Mistakes shows: three mistakes are open");
		await act(async () => {
			press.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
		});
		for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
		assert.equal(document.querySelectorAll("[data-slot=mistake-row]").length, 3);
		const top = popoverTop();
		const facts = LAYOUT["page-standing"]!;
		assert.ok(top >= facts.top + facts.height, `the popover's top (${top}px) is below the facts row (${facts.top + facts.height}px)`);
	});

	it("lets each mistake's words run to two lines instead of cutting them at one", async () => {
		await mountHead();
		await act(async () => {
			document.querySelector("[data-slot=course-mistakes]")!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
		});
		const words = [...document.querySelectorAll("[data-slot=mistake-row]")].map((row) => row.querySelector("[data-slot=mistake-words]"));
		assert.equal(words.length, 3);
		for (const line of words) {
			assert.ok(line, "each row carries its words");
			assert.match(line.getAttribute("class") ?? "", /\bline-clamp-2\b/, "the words wrap to a second line");
			assert.doesNotMatch(line.getAttribute("class") ?? "", /\btruncate\b/, "the words are not cut at one line");
		}
		assert.match(words[1]!.textContent ?? "", /result$/, "the whole sentence is there for the second line to show");
	});
});
