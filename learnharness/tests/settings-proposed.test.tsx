import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { Toggle } from "../components/settings/controls.tsx";
import { AgentSection } from "../components/settings/agent-section.tsx";

// The settings kit on the real Radix layers. Fetch is stubbed read-only.
const originalFetch = globalThis.fetch;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
});

async function mount(node: React.ReactElement) {
	globalThis.fetch = async (input, init) => {
		assert.equal(init?.method ?? "GET", "GET", "the kit itself never writes; its host does");
		void input;
		return Response.json({});
	};
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(node); });
	await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}

function element(selector: string): HTMLElement {
	const node = document.querySelector<HTMLElement>(selector);
	assert.ok(node, `expected ${selector}`);
	return node;
}

async function press(target: Element, type: string, init: Record<string, unknown> = {}) {
	await act(async () => {
		const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ctrlKey: false, detail: 1, ...init });
		target.dispatchEvent(event);
	});
}

describe("settings switch", () => {
	it("is the shadcn switch, named and pinned as before, and flips its value", async () => {
		const flips: boolean[] = [];
		await mount(<Toggle checked={false} label="tool research" onChange={(v) => flips.push(v)} />);
		const control = element('[data-testid="toggle-tool-research"]');
		assert.equal(control.getAttribute("data-slot"), "switch");
		assert.equal(control.getAttribute("role"), "switch");
		assert.equal(control.getAttribute("aria-label"), "tool research");
		assert.equal(control.getAttribute("aria-checked"), "false");
		await press(control, "click");
		assert.deepEqual(flips, [true]);
	});
});

describe("Settings › Tutor", () => {
	it("has no model or thinking choice, only the tool switches", async () => {
		await mount(<AgentSection agent={undefined} onSectionChange={() => {}} />);
		assert.equal(document.querySelector('[data-testid="group-models"]'), null);
		assert.equal(document.querySelector('[data-testid^="slot-"]'), null);
		assert.ok(element('[data-testid="group-tools"]'));
	});
});
