/**
 * The quiet arc selector every map style but Current draws above the map
 * (arc-selector.md; Edo, 16 Nov 2026: the pill strip was "too in the
 * way"): one line, the shown arc's whole name opening the list of arcs, a
 * dot per arc in study order with the arc he is in ringed, each dot a
 * press that shows its arc.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dom } from "./helpers/radix-dom.ts";
(globalThis as Record<string, unknown>).self = globalThis;
import { createRoot, renderToStaticMarkup, type Root } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import type { ArcHandle } from "../src/core/index.ts";
import { ArcSelector, HERE_WORDS } from "../components/course-map/arc-selector.tsx";

const a = (handle: string) => handle as ArcHandle;
const ARCS = [
	{ handle: a("vectors"), title: "Vectors and span", share: 1 },
	{ handle: a("bases"), title: "Independence and bases", share: 0.5 },
	{ handle: a("diag"), title: "Diagonalization by change of basis", share: 0 },
	{ handle: a("orth"), title: "Orthogonality", share: null },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	host?.remove();
	root = host = null;
});

describe("the arc selector", () => {
	const markup = (value: string) => parseHTML(`<html><body>${renderToStaticMarkup(<ArcSelector arcs={ARCS} value={a(value)} here={a("diag")} onSelect={() => {}} />)}</body></html>`).document;

	it("names the shown arc whole on one line, never as pills", () => {
		const document = markup("diag");
		const menu = document.querySelector('[data-slot="arc-selector-menu"]')!;
		assert.equal(menu.textContent, "Diagonalization by change of basis");
		assert.match(menu.getAttribute("class") ?? "", /whitespace-nowrap/);
		assert.doesNotMatch(menu.getAttribute("class") ?? "", /truncate/);
		assert.ok(document.querySelector('[data-slot="arc-pill"], [data-slot="toggle-group-item"]') === null);
	});

	it("draws one dot per arc in study order, the shown one on and the arc he is in ringed", () => {
		const document = markup("bases");
		const dots = [...document.querySelectorAll('[data-slot="arc-rail"] [data-arc]')];
		assert.deepEqual(dots.map((d) => d.getAttribute("data-arc")), ["vectors", "bases", "diag", "orth"]);
		assert.deepEqual(dots.map((d) => d.getAttribute("data-state")), ["off", "on", "off", "off"]);
		assert.deepEqual(dots.map((d) => d.hasAttribute("data-here")), [false, false, true, false]);
		assert.deepEqual(dots.map((d) => d.getAttribute("aria-label")), ARCS.map((x) => x.title), "each dot is named by its arc");
	});

	it("shows the arc of a dot he presses", async () => {
		const picked: string[] = [];
		host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		await act(async () => root!.render(<ArcSelector arcs={ARCS} value={a("diag")} here={a("diag")} onSelect={(x) => picked.push(x)} />));
		const dot = document.querySelector('[data-slot="arc-rail"] [data-arc="vectors"]')!;
		await act(async () => {
			dot.dispatchEvent(new dom.window.Event("click", { bubbles: true }) as unknown as Event);
		});
		assert.deepEqual(picked, ["vectors"]);
	});

	it("says where he is in the list of arcs", () => {
		assert.equal(HERE_WORDS, "You are here");
	});
});
