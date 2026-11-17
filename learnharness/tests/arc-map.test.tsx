/**
 * Every course map with arcs is one component (`ArcMap`; Edo, 17 Nov 2026:
 * "the graph should be the same single standardised component across
 * views"): Home and the enlarged map list the course's arcs left of the
 * map on one hairline track, the arc shown under its bar, the arc he is in
 * dotted, each row a press that shows its arc, and ⌘J goes to You are here.
 * The course page's map lists none, since its road is the course's one list
 * of arcs, and keeps ⇧↑ and ⇧↓. Its old selector (a name, a chevron, a dot
 * per arc) is gone.
 */
import React, { act, useState } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dom } from "./helpers/radix-dom.ts";
(globalThis as Record<string, unknown>).self = globalThis;
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { currentArc, type ArcHandle } from "../src/core/index.ts";
import { ArcMap } from "../components/course-map/arc-map.tsx";
import { HomeMap } from "../components/study-home/home-map.tsx";
import { SplitMap } from "../components/course-page/split/split-map.tsx";
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
/** The course page's map pane on one arc. */
const coursePage = (arc: ArcHandle, onOpenArc: (arc: ArcHandle) => void) => (
	<SplitMap map={LINALG_ARCS.map} arc={arc} arcs={ARCS} said={new Map()} lit={null} aim={null} reveal={null} onPoint={noop} onLeave={noop} onOpenArc={onOpenArc} enlarged={false} onEnlarge={noop} />
);

/** The course page's map pane, enlarging as the page does. */
function EnlargingCoursePage({ onOpenArc }: { onOpenArc: (arc: ArcHandle) => void }) {
	const [enlarged, setEnlarged] = useState(false);
	return <SplitMap map={LINALG_ARCS.map} arc={a("systems")} arcs={ARCS} said={new Map()} lit={null} aim={null} reveal={null} onPoint={noop} onLeave={noop} onOpenArc={onOpenArc} enlarged={enlarged} onEnlarge={setEnlarged} />;
}

describe("the course page's map enlarged", () => {
	it("enlarges with Home's control, and the same control or Esc brings the page back, the arc kept", async () => {
		const opened: string[] = [];
		await mount(<EnlargingCoursePage onOpenArc={(arc) => opened.push(arc)} />);
		const control = () => document.querySelector('[data-slot="course-map-enlarge"]')!;
		const key = (k: string, shiftKey = false) =>
			act(async () => {
				document.body.dispatchEvent(Object.assign(new dom.window.Event("keydown", { bubbles: true, cancelable: true }), { key: k, shiftKey, altKey: false, metaKey: false, ctrlKey: false }) as unknown as Event);
			});
		const press = () =>
			act(async () => {
				control().dispatchEvent(new dom.window.Event("click", { bubbles: true }) as unknown as Event);
			});
		assert.equal(control().getAttribute("aria-label"), "Enlarge map");
		await press();
		assert.equal(control().getAttribute("aria-pressed"), "true");
		assert.equal(control().getAttribute("aria-label"), "Back to the course");
		await press();
		assert.equal(control().getAttribute("aria-pressed"), "false", "the same control brings the page back");
		await press();
		await key("ArrowDown", true);
		assert.deepEqual(opened, ["eigenvalues"], "enlarged, ⇧↓ still glides to the next arc");
		await key("Escape");
		assert.equal(control().getAttribute("aria-pressed"), "false", "Esc brings the page back");
		assert.ok(document.querySelector('[data-slot="course-split-map"]'), "the map itself stays");
	});
});

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

	it("lists the arcs beside Home's map and none beside the course page's, whose road lists them, and no old selector", async () => {
		await mount(<HomeMap courses={[LINALG_ARCS, PROB]} chats={[]} workspace={LINALG_ARCS.map.workspace} onSelect={noop} arc={null} enlarged={false} onEnlarge={noop} />);
		assert.ok(document.querySelector('[data-slot="arc-index"]'), "Home lists them");
		await act(async () => root!.unmount());
		host!.remove();
		await mount(coursePage(a("systems"), noop));
		assert.ok(document.querySelector('[data-slot="arc-index"]') === null, "the course page's map lists none");
		assert.ok(document.querySelector('[data-slot="arc-selector"], [data-slot="arc-rail"], [data-slot="course-split-map-head"]') === null);
	});

	it("shows the arc above or below on the course page on ⇧↑ and ⇧↓", async () => {
		const opened: string[] = [];
		await mount(coursePage(a("systems"), (arc) => opened.push(arc)));
		const key = (k: string) =>
			act(async () => {
				document.body.dispatchEvent(Object.assign(new dom.window.Event("keydown", { bubbles: true, cancelable: true }), { key: k, shiftKey: true, altKey: false, metaKey: false, ctrlKey: false }) as unknown as Event);
			});
		await key("ArrowUp");
		await key("ArrowDown");
		assert.deepEqual(opened, ["spaces", "eigenvalues"]);
	});

	it("glides from arc to arc on ⇧↓ on the course page through Home's camera, not by swapping the drawing", async () => {
		const shiftDown = () =>
			act(async () => {
				document.body.dispatchEvent(Object.assign(new dom.window.Event("keydown", { bubbles: true, cancelable: true }), { key: "ArrowDown", shiftKey: true, altKey: false, metaKey: false, ctrlKey: false }) as unknown as Event);
			});
		/** The cards of the arc the camera glides away from, drawn beside the new one until it lands (topic-map.md, The glide). */
		const trail = () => [...document.querySelectorAll('[data-slot="course-map-trail"]')].map((el) => el.closest(".react-flow__node")?.getAttribute("data-id")).sort();

		await mount(<HomeMap courses={[LINALG_ARCS]} chats={[]} workspace={LINALG_ARCS.map.workspace} onSelect={noop} arc={null} enlarged={false} onEnlarge={noop} />);
		await shiftDown();
		const home = trail();
		assert.ok(home.length > 0, "Home glides: the arc it left stays drawn beside the new one");
		await act(async () => root!.unmount());
		host!.remove();

		let arc = currentArc(LINALG_ARCS.map)!;
		const draw = () => root!.render(<AppRouterContext.Provider value={router as never}>{coursePage(arc, (to) => ((arc = to), draw()))}</AppRouterContext.Provider>);
		host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		await act(async () => draw());
		await shiftDown();
		assert.notEqual(arc, currentArc(LINALG_ARCS.map), "⇧↓ showed the next arc");
		assert.deepEqual(trail(), home, "the course page glides the same way, from the same arc's cards");
	});

	it("goes to You are here on ⌘J from another arc of the course page: its arc, then its card", async () => {
		const opened: string[] = [];
		let arc = a("eigenvalues");
		const draw = () => root!.render(<AppRouterContext.Provider value={router as never}>{coursePage(arc, (to) => (opened.push(to), (arc = to), draw()))}</AppRouterContext.Provider>);
		host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		await act(async () => draw());
		await act(async () => {
			document.body.dispatchEvent(Object.assign(new dom.window.Event("keydown", { bubbles: true, cancelable: true }), { key: "j", shiftKey: false, altKey: false, metaKey: true, ctrlKey: false }) as unknown as Event);
		});
		assert.deepEqual(opened, ["systems"]);
		await act(async () => new Promise((done) => setTimeout(done, 20)));
		assert.equal(document.activeElement?.getAttribute("data-testid"), `map-node-${LINALG_ARCS.map.current}`);
	});
});
