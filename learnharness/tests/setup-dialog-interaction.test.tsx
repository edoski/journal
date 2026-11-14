import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { SetupDialog } from "../components/setup-dialog.tsx";
import { CLAUDE_MODEL } from "../src/core/index.ts";

// Mount real React handlers on the real Radix layers.
// Fetch is wholly stubbed; no settings or session writes can escape.
const originalFetch = globalThis.fetch;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let closed = 0;
let connected = false;

async function mount() {
	closed = 0;
	globalThis.fetch = async (input, init) => {
		assert.equal(init?.method ?? "GET", "GET", "interaction tests must not write data");
		const path = new URL(String(input), "http://localhost").pathname;
		if (path === "/api/subscriptions/claude") return Response.json({ accounts: [] });
		assert.equal(path, "/api/models");
		return Response.json({ account: "claude-subscription", connected, contextWindow: 200000 });
	};
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	function Harness() {
		const [open, setOpen] = React.useState(true);
		return <SetupDialog open={open} onClose={() => { closed++; setOpen(false); }} />;
	}
	await act(async () => { root!.render(<Harness />); });
	await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

function element(selector: string): HTMLElement {
	const node = document.querySelector<HTMLElement>(selector);
	assert.ok(node, `expected ${selector}`);
	return node;
}

// linkedom clears an event's target when dispatch ends; a browser keeps it,
// and the dialog and popover read the press's target again on its click.
class PressEvent extends dom.window.Event {}
Object.defineProperty(PressEvent.prototype, "target", {
	get(this: { pressed?: EventTarget }) { return this.pressed ?? null; },
	set(this: { pressed?: EventTarget }, value: EventTarget | null) { if (value) this.pressed = value; },
});

async function event(target: HTMLElement, type: string) {
	await act(async () => {
		const dispatched = new PressEvent(type, { bubbles: true, cancelable: true });
		Object.assign(dispatched, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ctrlKey: false, detail: 1 });
		target.dispatchEvent(dispatched);
	});
	// Radix layers start listening for outside presses a tick after they open.
	await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function click(target: HTMLElement) {
	for (const type of ["pointerdown", "pointerup", "click"]) await event(target, type);
}

async function key(target: Element, name: string) {
	await act(async () => {
		const keydown = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(keydown, { key: name });
		target.dispatchEvent(keydown);
	});
}

const escape = () => key(document.activeElement!, "Escape");

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
	connected = false;
});

describe("setup polish interactions", () => {
	it("the sign-in stage shows the connections, Escape closes setup, and an outside press closes it", async () => {
		await mount();
		assert.ok(document.querySelector('[data-testid="setup-stage-keys"] [data-testid="claude-connection"]'));
		assert.equal(document.querySelector('[data-testid="setup-key-input"]'), null, "no key field");
		await escape();
		assert.equal(closed, 1);
		await mount();
		await click(element('[data-slot="dialog-overlay"]'));
		assert.equal(closed, 1, "the overlay closes a fresh setup");
		assert.equal(document.querySelector('[data-testid="setup-dialog"]'), null);
	});

	it("inside press followed by overlay release and ancestor click does not dismiss setup", async () => {
		await mount();
		await event(element('[data-testid="setup-dialog"] [data-slot="dialog-title"]'), "pointerdown");
		await event(element('[data-slot="dialog-overlay"]'), "pointerup");
		await event(element('[data-slot="dialog-overlay"]'), "click");
		assert.equal(closed, 0);
		assert.ok(document.querySelector('[data-testid="setup-dialog"]'));
	});

	it("names the one model it runs on and shows only the Claude sign-in, with no key field", async () => {
		await mount();
		assert.equal(element('[data-slot="dialog-title"]').textContent, "Sign in to Claude");
		assert.ok(element('[data-testid="setup-dialog"]').textContent!.includes(`Lessons run on ${CLAUDE_MODEL.name} through your Claude plan.`));
		assert.ok(document.querySelector('[data-testid="setup-stage-keys"] [data-testid="claude-connection"]'));
		assert.equal(document.querySelector('[data-testid="chatgpt-connection"]'), null, "ChatGPT runs no lesson");
		assert.equal(document.querySelector('[data-testid="setup-key-input"]'), null, "no key field");
	});

	it("closes itself once the account in use is signed in", async () => {
		connected = true;
		await mount();
		assert.equal(closed, 1);
		assert.equal(document.querySelector('[data-testid="setup-dialog"]'), null);
	});
});
