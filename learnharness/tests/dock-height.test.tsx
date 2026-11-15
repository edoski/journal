import React, { act, useRef } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement,
	IS_REACT_ACT_ENVIRONMENT: true,
});
const observers: TestObserver[] = [];
class TestObserver {
	elements = new Set<Element>();
	disconnected = false;
	constructor(readonly callback: () => void) { observers.push(this); }
	observe(el: Element) { this.elements.add(el); }
	disconnect() { this.disconnected = true; this.elements.clear(); }
}
Object.assign(globalThis, {
	ResizeObserver: TestObserver,
	getComputedStyle: (el: HTMLElement) => ({ overflowY: el.style.overflowY || "visible" }),
});
// Import after installing window so the hook uses its browser layout effect.
const { useDockReserve, forwardDockWheel } = await import("../components/dock-height.ts");

describe("the composer's reserve", () => {
	it("reports the block's height and the scrollbar gutter at mount and on resize, and lets go on unmount", async () => {
		let height = 120;
		const heights: number[] = [];
		const insets: number[] = [];
		function Host() {
			const scrollRef = useRef<HTMLDivElement>(null);
			const blockRef = useRef<HTMLDivElement>(null);
			useDockReserve({ scrollRef, blockRef, onHeight: (h) => heights.push(h), onScrollbarInset: (i) => insets.push(i) });
			return (
				<div ref={scrollRef}>
					<div ref={blockRef} />
				</div>
			);
		}
		const host = document.createElement("div");
		document.body.appendChild(host);
		const root = createRoot(host);
		const block = () => host.firstElementChild!.firstElementChild as HTMLElement;
		const realRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
		dom.window.HTMLElement.prototype.getBoundingClientRect = function () { return { height } as DOMRect; };
		try {
			await act(async () => root.render(<Host />));
			assert.deepEqual(heights, [120]);
			assert.equal(insets.length, 1);
			const observer = observers.at(-1)!;
			assert.ok(observer.elements.has(block()));
			height = 180;
			observer.callback();
			assert.deepEqual(heights, [120, 180]);
			await act(async () => root.unmount());
			assert.equal(observer.disconnected, true);
		} finally {
			dom.window.HTMLElement.prototype.getBoundingClientRect = realRect;
		}
	});
});

describe("wheel routing — question, short-window content, then transcript", () => {
	it("keeps native wheel input in the question and then the whole-content viewport", () => {
		const root = document.createElement("div");
		root.innerHTML = '<div data-viewport style="overflow-y:auto"><div data-question style="overflow-y:auto"><span>text</span></div></div>';
		const viewport = root.firstElementChild as HTMLElement;
		const question = viewport.firstElementChild as HTMLElement;
		const transcript = document.createElement("div"); transcript.scrollTop = 100;
		for (const el of [viewport, question]) { el.dataset.scrollHeight = "400"; el.dataset.clientHeight = "100"; el.scrollTop = 50; }
		const wheel = (deltaY: number, deltaMode = 0) => {
			let prevented = false;
			forwardDockWheel({ target: question.firstElementChild, deltaY, deltaMode, preventDefault() { prevented = true; } } as unknown as WheelEvent, root, transcript);
			return prevented;
		};
		assert.equal(wheel(-20), false, "question can scroll up");
		question.scrollTop = 0;
		assert.equal(wheel(-20), false, "whole content can scroll up when question is at its edge");
		viewport.scrollTop = 0;
		assert.equal(wheel(-20), true);
		assert.equal(transcript.scrollTop, 80);
		question.scrollTop = viewport.scrollTop = 300;
		assert.equal(wheel(1, 1), true);
		assert.equal(transcript.scrollTop, 96, "line-mode wheel is normalized");
		viewport.style.overflowY = "visible"; viewport.scrollTop = 50;
		assert.equal(wheel(-20), false, "question still consumes upward movement");
		question.style.overflowY = "hidden";
		assert.equal(wheel(-20), true, "hidden and visible boxes are not scroll containers");
		assert.equal(wheel(0), false);
	});
});
