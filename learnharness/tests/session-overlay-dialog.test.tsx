/**
 * A diagram, figure or photo opened large is a dialog in the session area
 * (session-overlay.tsx): it takes focus as it opens, one Esc closes it and
 * never reaches the window's turn abort, and focus goes back to what opened
 * it.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoot } from "./helpers/app-render.tsx";
import { MermaidOverlay } from "../components/session-overlay.tsx";

const FIGURE = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><path d="M0 0L20 20"/></svg>';

describe("the session overlay", () => {
	it("takes focus, closes on one Esc the window never hears, and gives focus back to its opener", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const opener = document.createElement("button");
		document.body.appendChild(opener);
		opener.focus();
		const root = createRoot(host);
		let closed = 0;
		function Harness() {
			const [open, setOpen] = React.useState(true);
			return open ? <MermaidOverlay svg={FIGURE} onClose={() => { closed++; setOpen(false); }} /> : null;
		}
		await act(async () => root.render(<Harness />));
		await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
		const overlay = document.querySelector('[data-testid="mermaid-overlay"]')!;
		assert.ok(overlay.contains(document.activeElement), "focus moves into the overlay as it opens");
		let reachedWindow = 0;
		const onWindow = (e: Event) => { if ((e as KeyboardEvent).key === "Escape") reachedWindow++; };
		window.addEventListener("keydown", onWindow);
		await act(async () => {
			const key = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
			Object.assign(key, { key: "Escape" });
			document.activeElement!.dispatchEvent(key);
		});
		window.removeEventListener("keydown", onWindow);
		await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
		assert.equal(closed, 1, "one Esc closes it");
		assert.equal(reachedWindow, 0, "the window's turn abort never hears it");
		assert.equal(document.activeElement, opener, "focus goes back to what opened it");
		await act(async () => root.unmount());
		host.remove();
		opener.remove();
	});
});
