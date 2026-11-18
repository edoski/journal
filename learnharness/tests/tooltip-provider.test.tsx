/**
 * One tooltip provider for the whole app (app/layout.tsx), as shadcn sets it
 * up: a hint waits its rest delay, and once one has opened, the next hint he
 * moves to opens at once instead of waiting again.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoot } from "./helpers/app-render.tsx";
import { Hint } from "../components/ui/hint.tsx";
import { TOOLTIP_DELAY_MS } from "../components/ui/tooltip.tsx";

async function pointer(el: Element, type: "pointermove" | "pointerleave") {
	await act(async () => {
		const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, { pointerType: "mouse" });
		el.dispatchEvent(event);
	});
}

describe("hints share one provider", () => {
	it("the second hint opens at once after the first", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const root = createRoot(host);
		await act(async () => root.render(
			<div>
				<Hint label="Zoom in"><button data-testid="a">+</button></Hint>
				<Hint label="Zoom out"><button data-testid="b">-</button></Hint>
			</div>,
		));
		const a = host.querySelector('[data-testid="a"]')!;
		const b = host.querySelector('[data-testid="b"]')!;
		await pointer(a, "pointermove");
		assert.equal(a.getAttribute("data-state"), "closed", "the first hint waits its rest delay");
		await act(async () => { await new Promise((r) => setTimeout(r, TOOLTIP_DELAY_MS + 100)); });
		assert.equal(a.getAttribute("data-state"), "delayed-open");
		await pointer(a, "pointerleave");
		await pointer(b, "pointermove");
		assert.equal(b.getAttribute("data-state"), "instant-open", "the next hint opens without a second wait");
		await act(async () => root.unmount());
		host.remove();
	});
});
