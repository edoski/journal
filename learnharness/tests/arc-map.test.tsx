/**
 * Every course map with arcs is one component (`ArcMap`; Edo, 17 Nov 2026:
 * "the graph should be the same single standardised component across
 * views"): Home, the enlarged map and the course page list the course's
 * arcs left of the map on one hairline track, the arc shown under its bar,
 * the arc he is in dotted, each row a press that shows its arc, and H goes
 * to You are here. The course page's old selector (a name, a chevron, a dot
 * per arc) is gone.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dom } from "./helpers/radix-dom.ts";
(globalThis as Record<string, unknown>).self = globalThis;
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ArcHandle } from "../src/core/index.ts";
import { ArcMap } from "../components/course-map/arc-map.tsx";
import { HomeMap } from "../components/study-home/home-map.tsx";
import { SplitMap } from "../components/course-page/split/split-map.tsx";
import { drawingOf } from "../components/course-map/topic-map/map-drawing.ts";
import { LINALG_ARCS, PROB } from "./fixtures/now-demo.ts";

const router = { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} };
const a = (handle: string) => handle as ArcHandle;
const ARCS = LINALG_ARCS.map.arcs!;
const noop = () => {};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	host?.remove();
	root = host = null;
});

async function mount(node: React.ReactNode) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => root!.render(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>));
}

const rows = () => [...document.querySelectorAll('[data-slot="arc-index-row"]')];
const shown = () => document.querySelector('[data-slot="arc-index-row"][data-shown]')?.getAttribute("data-arc") ?? null;
const press = (el: Element) =>
	act(async () => {
		el.dispatchEvent(new dom.window.Event("click", { bubbles: true }) as unknown as Event);
	});

/** The course page's map pane on one arc. */
const coursePage = (arc: ArcHandle, onOpenArc: (arc: ArcHandle) => void) => (
	<SplitMap map={LINALG_ARCS.map} arc={arc} arcs={ARCS} said={new Map()} layout={drawingOf(LINALG_ARCS.map, arc).layout} wholeLayout={drawingOf(LINALG_ARCS.map, undefined).layout} lit={null} aim={null} reveal={null} onPoint={noop} onLeave={noop} onOpenArc={onOpenArc} />
);

describe("the arc list beside every course map", () => {
	it("lists every arc in study order, the shown one under the bar and the arc he is in dotted, named whole", async () => {
		await mount(<ArcMap arcs={ARCS} value={a("eigenvalues")} here={a("systems")} onSelect={noop}><div /></ArcMap>);
		assert.deepEqual(rows().map((r) => r.getAttribute("data-arc")), ["spaces", "systems", "eigenvalues"]);
		assert.equal(shown(), "eigenvalues");
		assert.deepEqual(rows().map((r) => r.hasAttribute("data-here")), [false, true, false]);
		assert.deepEqual(rows().map((r) => r.getAttribute("aria-label")), ["Vector spaces", "Linear systems, you are here", "Eigenvalues"]);
		assert.ok(document.querySelector('[data-slot="arc-index-bar"]'), "the bar on the track");
	});

	it("marks no arc while the map shows the whole course", async () => {
		await mount(<ArcMap arcs={ARCS} value={a("systems")} here={a("systems")} whole onSelect={noop}><div /></ArcMap>);
		assert.equal(shown(), null);
	});

	it("is the map alone for a course without arcs", async () => {
		await mount(<ArcMap arcs={null} value={null} here={null} onSelect={noop}><div data-slot="drawing" /></ArcMap>);
		assert.ok(document.querySelector('[data-slot="arc-index"]') === null);
		assert.ok(document.querySelector('[data-slot="drawing"]'));
	});

	it("draws the same list on Home and on the course page, and no old selector", async () => {
		await mount(<HomeMap courses={[LINALG_ARCS, PROB]} chats={[]} workspace={LINALG_ARCS.map.workspace} onSelect={noop} arc={null} enlarged={false} onEnlarge={noop} />);
		const home = document.querySelector('[data-slot="arc-index"]')!.outerHTML;
		await act(async () => root!.unmount());
		host!.remove();
		await mount(coursePage(a("systems"), noop));
		assert.equal(document.querySelector('[data-slot="arc-index"]')!.outerHTML, home, "one list, the same markup");
		assert.ok(document.querySelector('[data-slot="arc-selector"], [data-slot="arc-rail"], [data-slot="course-split-map-head"]') === null);
	});

	it("shows the arc he presses on the course page's list, and the arc above or below on ⇧↑ and ⇧↓", async () => {
		const opened: string[] = [];
		await mount(coursePage(a("systems"), (arc) => opened.push(arc)));
		await press(rows().find((r) => r.getAttribute("data-arc") === "eigenvalues")!);
		const key = (k: string) =>
			act(async () => {
				document.body.dispatchEvent(Object.assign(new dom.window.Event("keydown", { bubbles: true, cancelable: true }), { key: k, shiftKey: true, altKey: false, metaKey: false, ctrlKey: false }) as unknown as Event);
			});
		await key("ArrowUp");
		await key("ArrowDown");
		assert.deepEqual(opened, ["eigenvalues", "spaces", "eigenvalues"]);
	});

	it("goes to You are here on H from another arc of the course page: its arc, then its card", async () => {
		const opened: string[] = [];
		let arc = a("eigenvalues");
		const draw = () => root!.render(<AppRouterContext.Provider value={router as never}>{coursePage(arc, (to) => (opened.push(to), (arc = to), draw()))}</AppRouterContext.Provider>);
		host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		await act(async () => draw());
		await act(async () => {
			document.body.dispatchEvent(Object.assign(new dom.window.Event("keydown", { bubbles: true, cancelable: true }), { key: "h", shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }) as unknown as Event);
		});
		assert.deepEqual(opened, ["systems"]);
		await act(async () => new Promise((done) => setTimeout(done, 20)));
		assert.equal(document.activeElement?.getAttribute("data-testid"), `map-node-${LINALG_ARCS.map.current}`);
	});
});
