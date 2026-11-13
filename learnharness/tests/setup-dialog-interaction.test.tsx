import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { SetupDialog } from "../components/setup-dialog.tsx";
import type { ModelCatalogEntry } from "../src/core/contracts/models.ts";

// Mount real React handlers on the real Radix layers.
// Fetch is wholly stubbed; no key, settings, or session writes can escape.
const originalFetch = globalThis.fetch;
const provider = { id: "openrouter", label: "OpenRouter" };
const model: ModelCatalogEntry = {
	id: "fixture-text",
	name: "Fixture text",
	provider: provider.id,
	reasoning: false,
	input: ["text"],
	supportedLevels: ["off"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8192,
	maxTokens: 1024,
};
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let closed = 0;
let completed = 0;

async function mount({ keyed = false, catalogFails = false } = {}) {
	closed = 0;
	completed = 0;
	globalThis.fetch = async (input, init) => {
		assert.equal(init?.method ?? "GET", "GET", "interaction tests must not write data");
		const path = new URL(String(input), "http://localhost").pathname;
		if (path === "/api/subscriptions/claude") return Response.json({ accounts: [] });
		assert.equal(path, "/api/models");
		if (catalogFails) throw new Error("fixture catalog failure");
		return Response.json({
			providers: [{ ...provider, connected: keyed }],
			models: keyed ? [model] : [],
			slots: { strong: null, cheap: null, vision: null },
		});
	};
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	function Harness() {
		const [open, setOpen] = React.useState(true);
		return <SetupDialog open={open} onClose={() => { closed++; setOpen(false); }} onDone={() => { completed++; }} />;
	}
	await act(async () => { root!.render(<Harness />); });
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

/** Opens a thinking menu from the keyboard. linkedom has no capture phase,
 *  so the trigger's own pointerdown would read as outside the dialog. */
const openThinking = (slot: string) => key(element(`[data-testid="setup-thinking-${slot}"]`), "Enter");

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
	assert.equal(completed, 0, "opening or dismissing setup must not save models");
});

describe("setup polish interactions", () => {
	it("the sign-in stage shows the connections, Escape closes setup, and an outside press closes it", async () => {
		await mount();
		assert.ok(document.querySelector('[data-testid="setup-stage-keys"] [data-testid="subscription-connections"]'));
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

	it("model and thinking dropdowns keep outside-click dismissal and model guidance uses two sentences", async () => {
		await mount({ keyed: true });
		assert.equal(element('[data-testid="setup-dialog"] [data-slot="dialog-description"]').textContent, "Pick a model for each job. Lessons can start once all three are set.");
		await click(element('[data-testid="setup-trigger-strong"]'));
		assert.ok(document.querySelector('[data-testid="setup-menu-strong"]'));
		await click(element('[data-testid="setup-dialog"] [data-slot="dialog-title"]'));
		assert.equal(document.querySelector('[data-testid="setup-menu-strong"]'), null);
		await click(element('[data-testid="setup-trigger-strong"]'));
		await click(element('[data-testid="model-option-fixture-text"]'));
		await openThinking("strong");
		assert.ok(document.querySelector('[data-testid="setup-thinking-menu-strong"]'));
		await click(element('[data-testid="setup-dialog"] [data-slot="dialog-title"]'));
		assert.equal(document.querySelector('[data-testid="setup-thinking-menu-strong"]'), null);
		assert.equal(closed, 0);
	});

	it("the empty vision list gives the approved next action without an em dash", async () => {
		await mount({ keyed: true });
		await click(element('[data-testid="setup-trigger-vision"]'));
		assert.ok(element('[data-testid="setup-menu-vision"]').textContent?.includes("No image-capable models. Sign in to Claude or ChatGPT in Settings → Accounts."));
	});

	it("catalog failure uses the approved two-sentence error", async () => {
		await mount({ catalogFails: true });
		assert.ok(element('[data-testid="setup-dialog"]').textContent?.includes("Model catalog could not be loaded. Check the connection and retry."));
	});
});
