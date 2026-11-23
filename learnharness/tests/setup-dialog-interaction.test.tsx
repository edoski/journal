import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { SetupDialog } from "../components/setup-dialog.tsx";
import { CLAUDE_MODEL, type ClaudeAccountStatus } from "../src/core/index.ts";

// Mount real React handlers on the real Radix layers.
// Fetch is wholly stubbed; no settings or session writes can escape.
const originalFetch = globalThis.fetch;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let closed = 0;
let connected = false;
let accounts: ClaudeAccountStatus[] = [];
let refreshes = 0;

async function mount() {
	closed = 0;
	globalThis.fetch = async (input, init) => {
		assert.equal(init?.method ?? "GET", "GET", "interaction tests must not write data");
		const path = new URL(String(input), "http://localhost").pathname;
		if (path === "/api/subscriptions/claude") {
			if (String(input).includes("refresh=1")) refreshes++;
			return Response.json({ accounts });
		}
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
	accounts = [];
	refreshes = 0;
});

describe("setup polish interactions", () => {
	it("the sign-in stage shows the connections, Escape closes setup, and an outside press closes it", async () => {
		await mount();
		assert.ok(document.querySelector('[data-testid="setup-stage-keys"] [data-testid="claude-connection"]'));
		assert.ok(document.querySelector('[data-testid="setup-key-input"]') === null, "no key field");
		await escape();
		assert.equal(closed, 1);
		await mount();
		await click(element('[data-slot="dialog-overlay"]'));
		assert.equal(closed, 1, "the overlay closes a fresh setup");
		assert.ok(document.querySelector('[data-testid="setup-dialog"]') === null);
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
		assert.ok(document.querySelector('[data-testid="setup-key-input"]') === null, "no key field");
	});

	it("says the plan once (round 20, m17: \"Lessons run on Claude Opus 5.5 through your Claude plan.\" and \"Your lessons run on your Claude plan through Claude Code and count toward its limits.\")", async () => {
		await mount();
		const said = element('[data-testid="setup-dialog"]').textContent!;
		assert.equal(said.split("Claude plan").length - 1, 1, said);
		assert.ok(document.querySelector('[data-testid="setup-dialog"] [data-testid="claude-notice"]') === null);
	});

	it("closes itself once the account in use is signed in", async () => {
		connected = true;
		await mount();
		assert.equal(closed, 1);
		assert.ok(document.querySelector('[data-testid="setup-dialog"]') === null);
	});

	it("Sign in re-checks the account and opens while it is signed out, though an older read said connected (round 10, 4 minor 1, 61b)", async () => {
		connected = true;
		await mount();
		assert.equal(closed, 1, "the account read connected");
		await act(async () => { root?.unmount(); });
		host?.remove();
		connected = false; // the account signed out since that read
		await mount();
		assert.equal(closed, 0, "the dialog waits for a read taken since it opened");
		assert.ok(document.querySelector('[data-testid="setup-dialog"]') !== null, "Sign in opens the dialog");
	});

	it("names Claude once: no group heading repeats the row's name (round 10, 4 minor 7)", async () => {
		await mount();
		assert.ok(document.querySelector('[data-testid="setup-stage-keys"] h3') === null, "no group heading");
	});

	it("opens on Refresh, and the arrows walk Refresh, each Use this account and ✕ (round 21, m16: focus sat on ✕ and no arrow left it)", async () => {
		// The account in use is signed out; the other one is signed in, so it offers Use this account.
		accounts = [
			{ account: { providerId: "claude-subscription", label: "A", email: "a@example.com", auth: "token" }, connection: { state: "signed-out" }, usage: null, modelMissing: false },
			{ account: { providerId: "claude-b", label: "B", email: "b@example.com", auth: "token" }, connection: { state: "connected", email: "b@example.com", plan: "max" }, usage: null, modelMissing: false },
		];
		await mount();
		const refresh = element('[data-testid="claude-refresh"]');
		const use = element('[data-testid="claude-use-account"]');
		const close = element('[data-testid="setup-close"]');
		assert.ok(document.activeElement === refresh, `opens on Refresh, not ${document.activeElement?.getAttribute("data-testid")}`);
		await key(refresh, "ArrowDown");
		assert.ok(document.activeElement === use, "↓ steps onto Use this account");
		await key(use, "ArrowDown");
		assert.ok(document.activeElement === use, "↓ on the last stop stays");
		await key(use, "ArrowUp");
		assert.ok(document.activeElement === refresh, "↑ steps back onto Refresh");
		await key(refresh, "ArrowUp");
		assert.ok(document.activeElement === close, "↑ on Refresh reaches ✕");
		await key(close, "ArrowDown");
		assert.ok(document.activeElement === refresh, "↓ from ✕ reaches Refresh");
		// Enter on a focused button is its click.
		await click(document.activeElement as HTMLElement);
		await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
		assert.equal(refreshes, 1, "Enter on Refresh re-checks the accounts");
		assert.equal(closed, 0, "and the dialog stays open while the account is signed out");
	});
});
