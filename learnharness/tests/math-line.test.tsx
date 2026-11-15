/**
 * A one-line label cut where it may end (math-line.md): at spaces, never
 * inside a formula, a formula and the word glued to it one piece; a plain
 * word the box's ellipsis cuts at the box's edge.
 */
import React, { act, Profiler } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { MathLine, mathPrefix, mathUnits } from "../components/ui/math-line.tsx";

const dom = parseHTML("<html><body></body></html>");
const observers: { callback: () => void }[] = [];
Object.assign(globalThis, {
	window: dom.window,
	document: dom.document,
	HTMLElement: dom.window.HTMLElement,
	IS_REACT_ACT_ENVIRONMENT: true,
	ResizeObserver: class {
		constructor(readonly callback: () => void) {
			observers.push(this);
		}
		observe() {}
		disconnect() {}
	},
});

/** The course row's title box: a content-sized `block truncate` flex item,
 *  as wide as its text up to the room the row leaves it (181px in the 320px
 *  column at 1512×982, measured), at about 6.4px a character. */
let room = 181;
const textWidth = (el: HTMLElement) => Math.round((el.textContent ?? "").length * 6.4);
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollWidth", { get() { return textWidth(this); } });
Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { get() { return Math.min(textWidth(this), room); } });

async function mount(label: string) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	let renders = 0;
	await act(async () =>
		root.render(
			<Profiler id="line" onRender={() => renders++}>
				<MathLine>{label}</MathLine>
			</Profiler>,
		),
	);
	const box = host.firstElementChild as HTMLElement;
	return { box, renders: () => renders, observer: observers.at(-1)!, unmount: () => act(async () => root.unmount()) };
}

describe("where a title with formulas may be cut", () => {
	it("cuts at spaces and keeps each formula whole, with the word glued to it", () => {
		assert.deepEqual(mathUnits("Product construction for $M_1 \\times M_2$"), ["Product ", "construction ", "for ", "$M_1 \\times M_2$"]);
		assert.deepEqual(mathUnits("$\\sigma$-algebras and measures"), ["$\\sigma$-algebras ", "and ", "measures"]);
		assert.deepEqual(mathUnits("Plain title"), ["Plain ", "title"]);
	});

	it("ends a shortened title on the last whole piece, then an ellipsis", () => {
		const units = mathUnits("Product construction for $M_1 \\times M_2$");
		assert.equal(mathPrefix(units, 3), "Product construction for…");
		assert.equal(mathPrefix(units, 4), "Product construction for $M_1 \\times M_2$");
		assert.equal(mathPrefix(units, 9), "Product construction for $M_1 \\times M_2$");
	});
});

describe("a long title in a course row", () => {
	it("runs to the row's end and leaves the last word to the box's ellipsis, settling once", async () => {
		room = 181;
		const line = await mount("Random variables and distributions");
		assert.ok(line.box.textContent!.startsWith("Random variables and distrib"), `draws the word it cuts: ${line.box.textContent}`);
		assert.equal(line.box.clientWidth, 181, "the title fills the room the row leaves it");
		assert.ok(line.box.scrollWidth > line.box.clientWidth, "the box's own ellipsis cuts the last word");
		assert.ok(line.renders() <= 5, `settles in about log2 of its pieces renders, not ${line.renders()}`);

		const settled = line.renders();
		await act(async () => line.observer.callback());
		assert.equal(line.renders(), settled, "an unchanged width starts no refit");

		room = 130;
		await act(async () => line.observer.callback());
		assert.equal(line.box.textContent, "Random variables and…", "a narrower row cuts inside the next word");
		assert.equal(line.box.clientWidth, 130);
		assert.ok(line.box.scrollWidth > line.box.clientWidth);
		const narrowed = line.renders();
		await act(async () => line.observer.callback());
		assert.equal(line.renders(), narrowed, "the refit settles without starting another");

		room = 120;
		await act(async () => line.observer.callback());
		assert.equal(line.box.textContent, "Random variables…", "with no room for a letter of the next word the line ends on the last whole word, never on a space");
		assert.ok(line.box.scrollWidth <= line.box.clientWidth);
		await line.unmount();
	});

	it("still ends whole before a formula that does not fit, never cutting it", async () => {
		room = 181;
		const line = await mount("Product construction for $M_1 \\times M_2$");
		assert.equal(line.box.textContent, "Product construction for…");
		assert.ok(line.box.querySelector(".katex") === null, "no part of the formula is drawn");
		assert.ok(line.box.scrollWidth <= line.box.clientWidth, "nothing is left for the box's ellipsis to cut");
		await line.unmount();
	});
});
